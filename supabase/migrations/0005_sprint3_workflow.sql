-- =====================================================================
-- Sprint 3: daily Submit → weekly Publish (locked) workflow, "Received by",
-- manual ordering of rows, revision requests.
-- Run once in Supabase SQL Editor AFTER 0001–0004. (Safe to re-run; 0006 also contains all of this.)
--
-- Entry status meaning from now on:
--   draft        being encoded
--   submitted    office pressed "Submit" (done for the day) — still editable
--   transmitted  PUBLISHED for the week — locked (shown as "Published" in the app)
--   archived     removed
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------
alter table public.entries drop constraint if exists entries_status_check;
alter table public.entries add constraint entries_status_check
  check (status in ('draft', 'submitted', 'transmitted', 'archived'));

alter table public.entries
  add column if not exists position           int,              -- manual order in the office's table
  add column if not exists submitted_at       timestamptz,
  add column if not exists received_by        text,             -- name of the person who received the document
  add column if not exists received_at        timestamptz,
  add column if not exists received_marked_by uuid references auth.users on delete set null;

alter table public.transmittals
  add column if not exists revision_open         boolean not null default false,
  add column if not exists revision_requested_at timestamptz,
  add column if not exists revision_reason       text,
  add column if not exists revision_opened_by    uuid references auth.users on delete set null,
  add column if not exists revision_opened_at    timestamptz;

-- Not-yet-published entries may be deleted by their office.
drop policy if exists entries_delete on public.entries;
create policy entries_delete on public.entries for delete
  using (public.is_admin() or (committee_id = public.my_committee() and status in ('draft', 'submitted')));

-- ---------------------------------------------------------------------
-- 2. Published (transmitted) entries are LOCKED.
--    Allowed while locked: ordering and "received by" details.
--    Everything else needs an admin, or a transmittal opened for revision by an admin.
-- ---------------------------------------------------------------------
create or replace function public.guard_locked_entries()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_open boolean;
  free text[] := array['position', 'received_by', 'received_at', 'received_marked_by', 'updated_at', 'updated_by'];
begin
  if old.status <> 'transmitted' or auth.uid() is null or public.is_admin() then
    return new;
  end if;
  select revision_open into is_open from transmittals where id = old.transmittal_id;
  if coalesce(is_open, false) then
    return new;
  end if;
  if (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'This record is published and locked. Ask an administrator to allow revisions.';
  end if;
  return new;
end $$;

drop trigger if exists guard_locked_entries on public.entries;
create trigger guard_locked_entries
  before update on public.entries
  for each row execute function public.guard_locked_entries();

-- Only admins may OPEN a transmittal for revision; the office may request it or lock it again.
create or replace function public.guard_transmittal_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and new.revision_open and not coalesce(old.revision_open, false) then
    raise exception 'Only an administrator can allow revisions of a published transmittal.';
  end if;
  if new.revision_open and not coalesce(old.revision_open, false) then
    new.revision_opened_by := auth.uid();
    new.revision_opened_at := now();
  end if;
  return new;
end $$;

drop trigger if exists guard_transmittal_revision on public.transmittals;
create trigger guard_transmittal_revision
  before update on public.transmittals
  for each row execute function public.guard_transmittal_revision();

-- ---------------------------------------------------------------------
-- 3. Daily submissions (which offices finished today)
-- ---------------------------------------------------------------------
create table if not exists public.submissions (
  id           uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees on delete cascade,
  type         text not null check (type in ('ngo', 'christmas', 'barangay', 'sk', 'medical', 'personal')),
  submit_date  date not null default (now() at time zone 'Asia/Manila')::date,
  entry_count  int not null default 0,
  submitted_by uuid default auth.uid() references auth.users on delete set null,
  submitted_at timestamptz not null default now()
);
create index if not exists submissions_date on public.submissions (type, submit_date);

alter table public.submissions enable row level security;
drop policy if exists submissions_read on public.submissions;
create policy submissions_read on public.submissions for select using (public.is_approved());
drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions for insert with check (committee_id = public.my_committee());
drop policy if exists submissions_delete on public.submissions;
create policy submissions_delete on public.submissions for delete using (committee_id = public.my_committee() or public.is_admin());

-- Marks every draft of this type as submitted and records the submission.
create or replace function public.submit_entries(p_type text)
returns int language plpgsql security invoker set search_path = public as $$
declare
  v_committee uuid := public.my_committee();
  v_count int;
begin
  if v_committee is null then
    raise exception 'Your account is not approved or has no committee yet.';
  end if;
  update entries set status = 'submitted', submitted_at = now()
   where committee_id = v_committee and type = p_type and status = 'draft';
  get diagnostics v_count = row_count;
  insert into submissions (committee_id, type, entry_count) values (v_committee, p_type, v_count);
  return v_count;
end $$;

-- Publishing takes drafts AND submitted entries.
create or replace function public.transmit_entries(
  p_type text, p_code text, p_week int, p_covering text, p_date date,
  p_encoder_name text, p_encoder_position text, p_entry_ids uuid[]
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_committee uuid := public.my_committee();
  v_count int;
begin
  if v_committee is null then
    raise exception 'Your account is not approved or has no committee yet.';
  end if;

  insert into transmittals (committee_id, type, code, week_no, covering, transmitted_on, encoder_name, encoder_position)
  values (v_committee, p_type, p_code, p_week, p_covering, coalesce(p_date, current_date), p_encoder_name, p_encoder_position)
  returning id into v_id;

  update entries
     set status = 'transmitted', transmittal_id = v_id
   where id = any (p_entry_ids)
     and committee_id = v_committee
     and type = p_type
     and status in ('draft', 'submitted');

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'None of the selected entries could be published (already published or not yours).';
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 4. Manual ordering
-- ---------------------------------------------------------------------
-- Own rows: the order of the ids becomes position 1, 2, 3 …
create or replace function public.reorder_entries(p_ids uuid[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  update entries e
     set position = x.ord
    from unnest(p_ids) with ordinality as x(id, ord)
   where e.id = x.id and e.committee_id = public.my_committee();
end $$;

-- Published list: every office keeps its OWN arrangement (it cannot reorder other offices' rows).
create table if not exists public.entry_order (
  committee_id uuid not null references public.committees on delete cascade,
  entry_id     uuid not null references public.entries on delete cascade,
  position     int not null,
  primary key (committee_id, entry_id)
);
alter table public.entry_order enable row level security;
drop policy if exists entry_order_own on public.entry_order;
create policy entry_order_own on public.entry_order for all
  using (committee_id = public.my_committee()) with check (committee_id = public.my_committee());

create or replace function public.set_entry_order(p_ids uuid[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into entry_order (committee_id, entry_id, position)
  select public.my_committee(), x.id, x.ord from unnest(p_ids) with ordinality as x(id, ord)
  on conflict (committee_id, entry_id) do update set position = excluded.position;
end $$;

do $$
declare t text;
begin
  foreach t in array array['submissions', 'entry_order'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
