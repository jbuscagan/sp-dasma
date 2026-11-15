-- =====================================================================
-- Sprint 4 — SAFE TO RUN AT ANY TIME (can be run more than once).
-- It also adds everything from 0005 if 0005 was skipped
-- (this fixes the error "column entries.position does not exist").
--
--   1. Workflow columns/tables from 0005 (ordering, submit/publish, received, revisions)
--   2. Organizations: ONE record per organization (no barangay); entries link to it
--   3. Offices the admin allows may edit/delete their published records
--   4. Audit trail: who created, edited, submitted, published, deleted what
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Everything from 0005 (only what is missing)
-- ---------------------------------------------------------------------
alter table public.entries drop constraint if exists entries_status_check;
alter table public.entries add constraint entries_status_check
  check (status in ('draft', 'submitted', 'transmitted', 'archived'));

alter table public.entries
  add column if not exists position           int,
  add column if not exists submitted_at       timestamptz,
  add column if not exists received_by        text,
  add column if not exists received_at        timestamptz,
  add column if not exists received_marked_by uuid references auth.users on delete set null;

alter table public.transmittals
  add column if not exists revision_open         boolean not null default false,
  add column if not exists revision_requested_at timestamptz,
  add column if not exists revision_reason       text,
  add column if not exists revision_opened_by    uuid references auth.users on delete set null,
  add column if not exists revision_opened_at    timestamptz;

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
drop policy if exists submissions_insert on public.submissions;
drop policy if exists submissions_delete on public.submissions;
create policy submissions_read on public.submissions for select using (public.is_approved());
create policy submissions_insert on public.submissions for insert with check (committee_id = public.my_committee());
create policy submissions_delete on public.submissions for delete using (committee_id = public.my_committee() or public.is_admin());

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
  update entries set status = 'transmitted', transmittal_id = v_id
   where id = any (p_entry_ids) and committee_id = v_committee and type = p_type and status in ('draft', 'submitted');
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'None of the selected entries could be published (already published or not yours).';
  end if;
  return v_id;
end $$;

create or replace function public.reorder_entries(p_ids uuid[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  update entries e set position = x.ord
    from unnest(p_ids) with ordinality as x(id, ord)
   where e.id = x.id and e.committee_id = public.my_committee();
end $$;

create or replace function public.set_entry_order(p_ids uuid[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into entry_order (committee_id, entry_id, position)
  select public.my_committee(), x.id, x.ord from unnest(p_ids) with ordinality as x(id, ord)
  on conflict (committee_id, entry_id) do update set position = excluded.position;
end $$;

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
create trigger guard_transmittal_revision before update on public.transmittals
  for each row execute function public.guard_transmittal_revision();

-- ---------------------------------------------------------------------
-- 3. Offices allowed (by the admin) to edit / delete their PUBLISHED records
-- ---------------------------------------------------------------------
alter table public.committees add column if not exists can_edit_published boolean not null default false;

create or replace function public.office_can_edit_published()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select can_edit_published from committees where id = public.my_committee()), false);
$$;

-- Only an admin may give or remove that permission (members can still rename their office).
create or replace function public.guard_committee_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and new.can_edit_published is distinct from old.can_edit_published then
    raise exception 'Only an administrator can change who may edit published records.';
  end if;
  return new;
end $$;
drop trigger if exists guard_committee_update on public.committees;
create trigger guard_committee_update before update on public.committees
  for each row execute function public.guard_committee_update();

-- Published rows are locked, except: admin, an admin-opened revision, or an office with the permission.
create or replace function public.guard_locked_entries()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_open boolean;
  free text[] := array['position', 'received_by', 'received_at', 'received_marked_by', 'updated_at', 'updated_by'];
begin
  if old.status <> 'transmitted' or auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if old.committee_id = public.my_committee() and public.office_can_edit_published() then
    return new;
  end if;
  select revision_open into is_open from transmittals where id = old.transmittal_id;
  if coalesce(is_open, false) then
    return new;
  end if;
  if (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'This record is published and locked. Ask an administrator for permission to edit published records.';
  end if;
  return new;
end $$;
drop trigger if exists guard_locked_entries on public.entries;
create trigger guard_locked_entries before update on public.entries
  for each row execute function public.guard_locked_entries();

drop policy if exists entries_delete on public.entries;
create policy entries_delete on public.entries for delete using (
  public.is_admin()
  or (committee_id = public.my_committee() and status in ('draft', 'submitted'))
  or (committee_id = public.my_committee() and status in ('transmitted', 'archived') and public.office_can_edit_published())
);

-- ---------------------------------------------------------------------
-- 2. Organizations: one record per organization; entries point to it.
--    The barangay / chapter is chosen on each transmittal entry, not stored on the organization.
-- ---------------------------------------------------------------------
-- 2a. merge duplicates that only differed by barangay or letter case (keep the oldest)
delete from public.organizations o
 using public.organizations k
 where lower(btrim(o.name)) = lower(btrim(k.name))
   and (k.created_at, k.id::text) < (o.created_at, o.id::text);

alter table public.organizations drop constraint if exists organizations_name_barangay_key;
alter table public.organizations drop column if exists barangay;
create unique index if not exists organizations_name_ci on public.organizations (lower(btrim(name)));

-- 2b. entries → organizations link
alter table public.entries add column if not exists organization_id uuid references public.organizations on delete set null;
create index if not exists entries_organization on public.entries (organization_id);

-- Finds (or creates) the organization by name, ignoring letter case and extra spaces.
create or replace function public.link_entry_organization()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_name text;
begin
  if new.organization is null or btrim(new.organization) = '' then
    new.organization := null;
    new.organization_id := null;
    return new;
  end if;
  select id, name into v_id, v_name from organizations where lower(btrim(name)) = lower(btrim(new.organization));
  if v_id is null then
    insert into organizations (name) values (btrim(new.organization)) returning id, name into v_id, v_name;
  end if;
  new.organization_id := v_id;
  new.organization := v_name; -- same spelling everywhere
  return new;
end $$;
drop trigger if exists a_link_entry_organization on public.entries;
create trigger a_link_entry_organization before insert or update of organization on public.entries
  for each row execute function public.link_entry_organization();

-- link existing rows (runs as the database owner, so locks do not apply)
update public.entries e set organization_id = o.id, organization = o.name
  from public.organizations o
 where e.organization is not null and e.organization_id is null and lower(btrim(o.name)) = lower(btrim(e.organization));
insert into public.organizations (name)
select distinct on (lower(btrim(organization))) btrim(organization) from public.entries
 where organization is not null and btrim(organization) <> '' and organization_id is null
on conflict do nothing;
update public.entries e set organization_id = o.id, organization = o.name
  from public.organizations o
 where e.organization is not null and e.organization_id is null and lower(btrim(o.name)) = lower(btrim(e.organization));

-- Renaming an organization updates every entry that uses it.
create or replace function public.rename_organization_entries()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update entries set organization = new.name where organization_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists rename_organization_entries on public.organizations;
create trigger rename_organization_entries after update of name on public.organizations
  for each row execute function public.rename_organization_entries();

-- Admin: merge a duplicate organization into another one.
create or replace function public.merge_organizations(p_from uuid, p_into uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can merge organizations.';
  end if;
  select name into v_name from organizations where id = p_into;
  if v_name is null or p_from = p_into then
    raise exception 'Choose two different organizations.';
  end if;
  update entries set organization_id = p_into, organization = v_name where organization_id = p_from;
  delete from organizations where id = p_from;
end $$;

-- ---------------------------------------------------------------------
-- 4. Audit trail
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  user_id      uuid default auth.uid() references auth.users on delete set null,
  committee_id uuid references public.committees on delete set null,
  action       text not null,      -- create, edit, submit, publish, archive, restore, delete, received, revision, permission
  table_name   text not null,
  record_id    uuid,
  summary      text,
  changes      jsonb
);
create index if not exists audit_log_at on public.audit_log (at desc);
create index if not exists audit_log_committee on public.audit_log (committee_id, at desc);
alter table public.audit_log enable row level security;
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select using (public.is_admin() or committee_id = public.my_committee());
-- no insert/update/delete policies: rows are written only by the triggers below and cannot be edited.

create or replace function public.audit_entries()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_changes jsonb;
  r record;
  skip text[] := array['updated_at', 'updated_by', 'created_at'];
begin
  if tg_op = 'INSERT' then
    insert into audit_log (committee_id, action, table_name, record_id, summary)
    values (new.committee_id, 'create', 'entries', new.id, coalesce(new.patient_name, new.solicitor_name) || ' (' || new.type || ')');
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_log (committee_id, action, table_name, record_id, summary, changes)
    values (old.committee_id, 'delete', 'entries', old.id, coalesce(old.patient_name, old.solicitor_name) || ' (' || old.type || ')', to_jsonb(old));
    return old;
  end if;

  select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)) into v_changes
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
   where n.value is distinct from o.value and not (n.key = any (skip));
  if v_changes is null then
    return new;
  end if;

  v_action := case
    when new.status is distinct from old.status and new.status = 'submitted' then 'submit'
    when new.status is distinct from old.status and new.status = 'transmitted' then 'publish'
    when new.status is distinct from old.status and new.status = 'archived' then 'archive'
    when new.status is distinct from old.status and old.status = 'archived' then 'restore'
    when new.status is distinct from old.status and new.status = 'draft' then 'unpublish'
    when (v_changes - array['received_by', 'received_at', 'received_marked_by']) = '{}'::jsonb then 'received'
    when (v_changes - array['position']) = '{}'::jsonb then null   -- reordering is not logged
    else 'edit' end;
  if v_action is null then
    return new;
  end if;
  insert into audit_log (committee_id, action, table_name, record_id, summary, changes)
  values (new.committee_id, v_action, 'entries', new.id, coalesce(new.patient_name, new.solicitor_name) || ' (' || new.type || ')', v_changes);
  return new;
end $$;
drop trigger if exists audit_entries on public.entries;
create trigger audit_entries after insert or update or delete on public.entries
  for each row execute function public.audit_entries();

create or replace function public.audit_transmittals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_log (committee_id, action, table_name, record_id, summary)
    values (new.committee_id, 'publish', 'transmittals', new.id, new.code);
  elsif tg_op = 'DELETE' then
    insert into audit_log (committee_id, action, table_name, record_id, summary)
    values (old.committee_id, 'unpublish', 'transmittals', old.id, old.code);
    return old;
  elsif new.revision_open is distinct from old.revision_open or new.revision_requested_at is distinct from old.revision_requested_at then
    insert into audit_log (committee_id, action, table_name, record_id, summary)
    values (new.committee_id, 'revision', 'transmittals', new.id,
      new.code || case when new.revision_open then ': revision allowed'
                       when new.revision_requested_at is not null then ': revision requested — ' || coalesce(new.revision_reason, '')
                       else ': locked again' end);
  end if;
  return new;
end $$;
drop trigger if exists audit_transmittals on public.transmittals;
create trigger audit_transmittals after insert or update or delete on public.transmittals
  for each row execute function public.audit_transmittals();

create or replace function public.audit_committees()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.can_edit_published is distinct from old.can_edit_published then
    insert into audit_log (committee_id, action, table_name, record_id, summary)
    values (new.id, 'permission', 'committees', new.id,
      new.name || case when new.can_edit_published then ': may edit/delete published records' else ': published records locked' end);
  end if;
  return new;
end $$;
drop trigger if exists audit_committees on public.committees;
create trigger audit_committees after update on public.committees
  for each row execute function public.audit_committees();

-- ---------------------------------------------------------------------
-- 5. Live updates for the new tables (skips tables that are already added)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['submissions', 'entry_order', 'audit_log'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
