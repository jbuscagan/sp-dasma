-- =====================================================================
-- 0009 — DATA NORMALIZATION. Run after 0008. Safe to run more than once.
--
-- Before: some facts were stored as copied text on every request
--   (organization name, barangay name, "received by" office name), and two
--   permissions existed in two places. A spelling fix had to be repeated on
--   every row, and copies could disagree.
-- After: every fact is stored ONCE and linked by its id.
--   entries.organization_id        → organizations   (name lives only there)
--   entries.barangay_id            → barangays       (name lives only there)
--   entries.received_committee_id  → committees      (office name lives only there)
--   barangay_budgets.barangay_id   → barangays
--   Budget permission: per office only (committees.can_budget)
--   Publish permission: same as "edit / delete published" (committees.can_edit_published)
--
-- The website reads and writes requests through the view "entry_list", which shows
-- the names next to the ids, so screens and reports still see organization / barangay /
-- received_by as before. Names are turned into ids automatically when saving.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Name → id helpers (find, or create when new; ignores letter case and extra spaces)
-- ---------------------------------------------------------------------
-- Barangay names must be unique ignoring letter case: merge such duplicates first.
delete from public.barangays b
 using public.barangays k
 where lower(btrim(b.name)) = lower(btrim(k.name)) and k.id < b.id;
create unique index if not exists barangays_name_ci on public.barangays (lower(btrim(name)));

create or replace function public.barangay_id_of(p_name text)
returns int language plpgsql security definer set search_path = public as $$
declare v_id int;
begin
  if p_name is null or btrim(p_name) = '' then return null; end if;
  select id into v_id from barangays where lower(btrim(name)) = lower(btrim(p_name));
  if v_id is null then
    insert into barangays (name) values (btrim(p_name)) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.organization_id_of(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_name is null or btrim(p_name) = '' then return null; end if;
  select id into v_id from organizations where lower(btrim(name)) = lower(btrim(p_name));
  if v_id is null then
    insert into organizations (name) values (btrim(p_name)) returning id into v_id;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 1. Requests (entries): ids instead of copied names
-- ---------------------------------------------------------------------
drop view if exists public.entry_list;

alter table public.entries
  add column if not exists barangay_id int references public.barangays on delete restrict,
  add column if not exists received_committee_id uuid references public.committees on delete set null;
create index if not exists entries_barangay on public.entries (barangay_id);

-- Copy the old text into the links (only while the old columns still exist).
-- Triggers are paused so this one-time move does not fill the activity log.
alter table public.entries disable trigger user;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'entries' and column_name = 'barangay') then
    update public.entries set barangay_id = public.barangay_id_of(barangay) where barangay_id is null and btrim(coalesce(barangay, '')) <> '';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'entries' and column_name = 'organization') then
    update public.entries set organization_id = public.organization_id_of(organization) where organization_id is null and btrim(coalesce(organization, '')) <> '';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'entries' and column_name = 'received_by') then
    -- "Received by" = the receiving office. Old rows that held a person's name count as received by the office that owns the request.
    update public.entries e set received_committee_id = coalesce(
             (select c.id from public.committees c where lower(btrim(c.name)) = lower(btrim(e.received_by))),
             e.committee_id)
     where e.received_committee_id is null and (e.received_at is not null or btrim(coalesce(e.received_by, '')) <> '');
  end if;
end $$;
alter table public.entries enable trigger user;

drop trigger if exists a_link_entry_organization on public.entries;
drop function if exists public.link_entry_organization();
alter table public.entries
  drop column if exists organization,
  drop column if exists barangay,
  drop column if exists received_by;

-- Locked (published) records: receiving / ordering may still change.
create or replace function public.guard_locked_entries()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_open boolean;
  free text[] := array['position', 'received_committee_id', 'received_at', 'received_marked_by', 'updated_at', 'updated_by'];
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

-- Activity log for requests (same as before, "received" now uses the office id).
create or replace function public.audit_entries()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_changes jsonb;
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
    when (v_changes - array['received_committee_id', 'received_at', 'received_marked_by']) = '{}'::jsonb then 'received'
    when (v_changes - array['position']) = '{}'::jsonb then null   -- reordering is not logged
    else 'edit' end;
  if v_action is null then
    return new;
  end if;
  insert into audit_log (committee_id, action, table_name, record_id, summary, changes)
  values (new.committee_id, v_action, 'entries', new.id, coalesce(new.patient_name, new.solicitor_name) || ' (' || new.type || ')', v_changes);
  return new;
end $$;

-- Admin merge: only the link changes now (the name is stored once).
create or replace function public.merge_organizations(p_from uuid, p_into uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can merge organizations.';
  end if;
  if p_from = p_into or not exists (select 1 from organizations where id = p_into) then
    raise exception 'Choose two different organizations.';
  end if;
  update entries set organization_id = p_into where organization_id = p_from;
  delete from organizations where id = p_from;
end $$;

-- The view the website uses: every request with its names.
-- security_invoker = the reader's own access rules (RLS) apply, exactly as on the table.
create view public.entry_list with (security_invoker = true) as
select e.*,
       o.name  as organization,
       b.name  as barangay,
       rc.name as received_by
  from public.entries e
  left join public.organizations o on o.id = e.organization_id
  left join public.barangays b     on b.id = e.barangay_id
  left join public.committees rc   on rc.id = e.received_committee_id;

-- Same default values as the table (new id, today's date, draft …).
do $$
declare c record;
begin
  for c in select column_name, column_default from information_schema.columns
            where table_schema = 'public' and table_name = 'entries' and column_default is not null loop
    execute format('alter view public.entry_list alter column %I set default %s', c.column_name, c.column_default);
  end loop;
end $$;

-- Saving through the view: names → ids, then the real table is written
-- (all checks, locks and the activity log on "entries" still apply).
create or replace function public.entry_list_write()
returns trigger language plpgsql set search_path = public as $$
declare
  v_row jsonb;
  v_id uuid;
  v_cols text;
begin
  if tg_op = 'DELETE' then
    delete from entries where id = old.id;
    return old;
  end if;

  if tg_op = 'INSERT' or new.organization is distinct from old.organization then
    new.organization_id := coalesce(organization_id_of(new.organization), case when tg_op = 'INSERT' then new.organization_id end);
  end if;
  if tg_op = 'INSERT' or new.barangay is distinct from old.barangay then
    new.barangay_id := coalesce(barangay_id_of(new.barangay), case when tg_op = 'INSERT' then new.barangay_id end);
  end if;
  if tg_op = 'INSERT' then
    new.id := coalesce(new.id, gen_random_uuid());
    new.date_received := coalesce(new.date_received, current_date);
    new.status := coalesce(new.status, 'draft');
    new.assistance_status := coalesce(new.assistance_status, 'pending');
    new.attachment_paths := coalesce(new.attachment_paths, '{}');
    new.created_by := coalesce(new.created_by, auth.uid());
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, now());
  end if;

  v_row := to_jsonb(new) - 'organization' - 'barangay' - 'received_by';
  if tg_op = 'INSERT' then
    insert into entries select * from jsonb_populate_record(null::entries, v_row) returning id into v_id;
  else
    select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols
      from pg_attribute where attrelid = 'public.entries'::regclass and attnum > 0 and not attisdropped;
    execute format('update entries set (%1$s) = (select %1$s from jsonb_populate_record(null::entries, $1)) where id = $2', v_cols)
      using v_row, old.id;
    v_id := old.id;
  end if;

  select * into new from entry_list where id = v_id;
  return new;
end $$;

create trigger entry_list_write instead of insert or update or delete on public.entry_list
  for each row execute function public.entry_list_write();

grant select, insert, update, delete on public.entry_list to authenticated;

-- ---------------------------------------------------------------------
-- 2. Barangay & SK annual budgets: linked to the barangay list
-- ---------------------------------------------------------------------
alter table public.barangay_budgets add column if not exists barangay_id int references public.barangays on delete cascade;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'barangay_budgets' and column_name = 'barangay') then
    update public.barangay_budgets set barangay_id = public.barangay_id_of(barangay) where barangay_id is null;
    -- keep the newest row if two old rows now point to the same barangay
    delete from public.barangay_budgets a using public.barangay_budgets b
     where a.year = b.year and a.barangay_id = b.barangay_id and (a.updated_at, a.id::text) < (b.updated_at, b.id::text);
  end if;
end $$;
alter table public.barangay_budgets drop column if exists barangay;
alter table public.barangay_budgets alter column barangay_id set not null;
create unique index if not exists barangay_budgets_year_barangay on public.barangay_budgets (year, barangay_id);

-- Save one barangay's budget for a year (by barangay name). Budget access rules apply.
create or replace function public.save_barangay_budget(p_year int, p_barangay text, p_brgy numeric, p_sk numeric, p_remarks text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into barangay_budgets (year, barangay_id, brgy_budget, sk_budget, remarks, updated_at)
  values (p_year, barangay_id_of(p_barangay), p_brgy, p_sk, p_remarks, now())
  on conflict (year, barangay_id) do update
    set brgy_budget = excluded.brgy_budget, sk_budget = excluded.sk_budget, remarks = excluded.remarks, updated_at = now();
end $$;

-- ---------------------------------------------------------------------
-- 3. Permissions: one place each
-- ---------------------------------------------------------------------
-- Budget: accounts that had budget access give it to their office, then the account-level flag is removed.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'can_budget') then
    update public.committees c set can_budget = true
      from public.profiles p where p.committee_id = c.id and p.can_budget and p.status = 'approved';
  end if;
end $$;

create or replace function public.can_budget()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p left join committees c on c.id = p.committee_id
     where p.id = auth.uid() and p.status = 'approved'
       and (p.role = 'admin' or coalesce(c.can_budget, false))
  );
$$;

create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.committee_id is distinct from old.committee_id then
      raise exception 'Only an administrator can change role, status or committee.';
    end if;
  end if;
  return new;
end $$;
alter table public.profiles drop column if exists can_budget;

-- Publish = "edit / delete published" (0008); the separate flag is removed.
create or replace function public.guard_committee_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.can_edit_published is distinct from old.can_edit_published
          or new.can_budget is distinct from old.can_budget) then
    raise exception 'Only an administrator can change office permissions.';
  end if;
  return new;
end $$;

create or replace function public.audit_committees()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  msg text := '';
begin
  if new.can_edit_published is distinct from old.can_edit_published then
    msg := msg || case when new.can_edit_published then ' · may edit/delete/publish' else ' · published records locked' end;
  end if;
  if new.can_budget is distinct from old.can_budget then
    msg := msg || case when new.can_budget then ' · budget access given' else ' · budget access removed' end;
  end if;
  if msg <> '' then
    insert into audit_log (committee_id, action, table_name, record_id, summary)
    values (new.id, 'permission', 'committees', new.id, new.name || msg);
  end if;
  return new;
end $$;
alter table public.committees drop column if exists can_publish;

-- ---------------------------------------------------------------------
-- 4. Old "received" table from the first version (replaced by entries.received_*).
--    Removed only if it was never used, so no data is lost.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.entry_receipts') is not null and not exists (select 1 from public.entry_receipts) then
    drop table public.entry_receipts;
  end if;
end $$;
