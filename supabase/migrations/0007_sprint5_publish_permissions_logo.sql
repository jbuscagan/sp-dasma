-- =====================================================================
-- Sprint 5 — SAFE TO RUN AT ANY TIME (can be run more than once). Run after 0006.
--   1. Budget access and "may publish" are set per OFFICE (Admin › Offices & permissions)
--   2. Weekly published lists (Published (All) › Publish)
--   3. Storage for the city logo (uploaded by an admin in the app)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Office-level permissions
-- ---------------------------------------------------------------------
alter table public.committees
  add column if not exists can_budget  boolean not null default false,
  add column if not exists can_publish boolean not null default false;

-- Budget encoders: admins, offices with budget access (and accounts that were given it before).
create or replace function public.can_budget()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p left join committees c on c.id = p.committee_id
     where p.id = auth.uid() and p.status = 'approved'
       and (p.role = 'admin' or p.can_budget or coalesce(c.can_budget, false))
  );
$$;

create or replace function public.can_publish_week()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce((select can_publish from committees where id = public.my_committee()), false);
$$;

-- Only an admin may change any office permission.
create or replace function public.guard_committee_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.can_edit_published is distinct from old.can_edit_published
          or new.can_budget is distinct from old.can_budget
          or new.can_publish is distinct from old.can_publish) then
    raise exception 'Only an administrator can change office permissions.';
  end if;
  return new;
end $$;

-- Log every permission change.
create or replace function public.audit_committees()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  msg text := '';
begin
  if new.can_edit_published is distinct from old.can_edit_published then
    msg := msg || case when new.can_edit_published then ' · may edit/delete published' else ' · published records locked' end;
  end if;
  if new.can_budget is distinct from old.can_budget then
    msg := msg || case when new.can_budget then ' · budget access given' else ' · budget access removed' end;
  end if;
  if new.can_publish is distinct from old.can_publish then
    msg := msg || case when new.can_publish then ' · may publish the weekly list' else ' · may not publish the weekly list' end;
  end if;
  if msg <> '' then
    insert into audit_log (committee_id, action, table_name, record_id, summary)
    values (new.id, 'permission', 'committees', new.id, new.name || msg);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. Weekly published lists (combined records of all offices)
-- ---------------------------------------------------------------------
create table if not exists public.publications (
  id           uuid primary key default gen_random_uuid(),
  week_no      int,
  title        text,                                   -- e.g. "Week 46"
  covering     text,                                   -- e.g. (46th | Nov 15 to 21)
  date_from    date,
  date_to      date,
  published_on date not null default (now() at time zone 'Asia/Manila')::date,
  committee_id uuid references public.committees on delete set null,   -- office that published
  created_by   uuid default auth.uid() references auth.users on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists public.publication_entries (
  publication_id uuid not null references public.publications on delete cascade,
  entry_id       uuid not null references public.entries on delete cascade,
  position       int not null default 0,
  primary key (publication_id, entry_id)
);

alter table public.publications enable row level security;
alter table public.publication_entries enable row level security;

drop policy if exists publications_read on public.publications;
drop policy if exists publications_insert on public.publications;
drop policy if exists publications_delete on public.publications;
create policy publications_read on public.publications for select using (public.is_approved());
create policy publications_insert on public.publications for insert with check (public.can_publish_week());
create policy publications_delete on public.publications for delete using (public.is_admin());

drop policy if exists publication_entries_read on public.publication_entries;
drop policy if exists publication_entries_insert on public.publication_entries;
drop policy if exists publication_entries_delete on public.publication_entries;
create policy publication_entries_read on public.publication_entries for select using (public.is_approved());
create policy publication_entries_insert on public.publication_entries for insert with check (public.can_publish_week());
create policy publication_entries_delete on public.publication_entries for delete using (public.is_admin());

-- Writes the activity-log line for a weekly list (users cannot write to the log directly).
create or replace function public.log_publication(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (committee_id, action, table_name, record_id, summary)
  select p.committee_id, 'publish', 'publications', p.id,
         coalesce(p.title, 'Weekly list') || ' ' || coalesce(p.covering, '') || ' — '
         || (select count(*) from publication_entries pe where pe.publication_id = p.id) || ' record(s)'
    from publications p
   where p.id = p_id and p.created_by = auth.uid();   -- only for a list the caller just made
end $$;

-- Publishes the chosen transmitted records as one weekly list (all or nothing).
create or replace function public.publish_week(
  p_title text, p_covering text, p_week int, p_from date, p_to date, p_entry_ids uuid[]
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.can_publish_week() then
    raise exception 'Only an administrator or an office allowed to publish can do this.';
  end if;
  insert into publications (title, covering, week_no, date_from, date_to, committee_id)
  values (p_title, p_covering, p_week, p_from, p_to, public.my_committee())
  returning id into v_id;
  insert into publication_entries (publication_id, entry_id, position)
  select v_id, x.id, x.ord from unnest(p_entry_ids) with ordinality as x(id, ord)
    join entries e on e.id = x.id and e.status = 'transmitted';
  perform public.log_publication(v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 3. City logo (public image, only admins may upload or replace it)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
  on conflict (id) do nothing;

drop policy if exists branding_read on storage.objects;
drop policy if exists branding_write on storage.objects;
drop policy if exists branding_update on storage.objects;
drop policy if exists branding_delete on storage.objects;
create policy branding_read on storage.objects for select using (bucket_id = 'branding');
create policy branding_write on storage.objects for insert with check (bucket_id = 'branding' and public.is_admin());
create policy branding_update on storage.objects for update using (bucket_id = 'branding' and public.is_admin());
create policy branding_delete on storage.objects for delete using (bucket_id = 'branding' and public.is_admin());

-- ---------------------------------------------------------------------
-- 4. Live updates
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['publications', 'publication_entries'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
