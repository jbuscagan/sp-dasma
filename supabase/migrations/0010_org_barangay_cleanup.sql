-- =====================================================================
-- 0010 — Organization = organization only, Barangay = barangay only. Run after 0009. Safe to run again.
--
--  1. Barangay names are matched to the official list (ignoring capital letters, "Brgy.", accents,
--     1/I, 2/II …). A name that is not in the list is refused with a clear message, instead of
--     quietly creating a new "barangay". (Admins add barangays in Admin › Barangays & organizations.)
--  2. "KBDM - Salitran IV", "KBDM (Salitran IV)", "KBDM of Brgy. Salitran IV" typed or scanned in the
--     Organization box are split: KBDM → organization, Salitran IV → barangay.
--     "Barangay Salitran IV" typed as an organization is a barangay, not an organization.
--  3. Existing records are cleaned up the same way (organizations and barangays that were really
--     "organization - barangay" combinations).
--  4. Admins can merge two barangays (like organizations).
--  5. "Received by" shows "SPM <name>" instead of "Office of SPM <name>".
--  6. A weekly published list only takes records whose date is inside its From–To dates.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Matching barangay names
-- ---------------------------------------------------------------------
-- "Brgy. Sta. Cruz 2" and "Santa Cruz II" give the same key.
create or replace function public.place_key(p text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(translate(lower(' ' || coalesce(p, '') || ' '), 'ñáàéèíìóòúü', 'naaeeiioouu'),
            '\m(barangay|brgy|bgy)\M\.?', ' ', 'g'),
          '\msta\.?\s', ' santa ', 'g'),
        '\msto\.?\s', ' santo ', 'g'),
      '[^a-z0-9]+', ' ', 'g'),
    '\m1\M', 'i', 'g'), '\m2\M', 'ii', 'g'), '\m3\M', 'iii', 'g'), '\m4\M', 'iv', 'g'), '\m5\M', 'v', 'g'),
    '\s+', ' ', 'g'));
$$;

-- The official barangay with this name, or nothing. (Never creates one.)
create or replace function public.find_barangay(p text)
returns int language sql stable security definer set search_path = public as $$
  select id from barangays
   where nullif(btrim(coalesce(p, '')), '') is not null and place_key(name) = place_key(p)
   order by id limit 1;
$$;

-- 0009 created barangays from free text; from now on only the official list is used.
create or replace function public.barangay_id_of(p_name text)
returns int language sql stable security definer set search_path = public as $$
  select public.find_barangay(p_name);
$$;

-- "KBDM - Salitran IV" → ('KBDM', id of Salitran IV); "Barangay Salitran IV" → (null, id); "KBDM" → ('KBDM', null).
-- p_skip: a barangay id that must not be returned (used when cleaning up barangays themselves).
create or replace function public.split_org_barangay(p text, p_skip int default null, out org text, out barangay_id int)
language plpgsql stable security definer set search_path = public as $$
declare
  t text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
  m text[];
  b int;
begin
  org := nullif(t, '');
  barangay_id := null;
  if org is null then return; end if;
  -- "Org - Barangay" / "Org – Barangay" / "Org, Barangay" / "Org (Barangay)"
  m := regexp_match(t, '^(.+?)\s*(?:\s[-–—]\s|,|\()\s*([^,()]+?)\)?$');
  if m is not null then
    b := find_barangay(m[2]);
    if b is not null and b is distinct from p_skip then
      org := nullif(btrim(m[1], ' -–—,'), ''); barangay_id := b; return;
    end if;
  end if;
  -- "Org of Brgy. Barangay" / "Org ng Barangay X" / "Org Brgy. X"
  m := regexp_match(t, '^(.+?)\s+(?:(?:of|ng|sa)\s+)?(?:barangay|brgy\.?|bgy\.?)\s+(.+)$', 'i');
  if m is not null then
    b := find_barangay(m[2]);
    if b is not null and b is distinct from p_skip then
      org := nullif(btrim(m[1], ' -–—,'), ''); barangay_id := b; return;
    end if;
  end if;
  -- the whole text is a barangay
  b := find_barangay(t);
  if b is not null and b is distinct from p_skip then
    org := null; barangay_id := b;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Saving through the view: split, then link
-- ---------------------------------------------------------------------
create or replace function public.entry_list_write()
returns trigger language plpgsql set search_path = public as $$
declare
  v_row jsonb;
  v_id uuid;
  v_cols text;
  s record;
  t record;
  v_org text;
  v_brgy int;
begin
  if tg_op = 'DELETE' then
    delete from entries where id = old.id;
    return old;
  end if;

  if tg_op = 'INSERT' or new.organization is distinct from old.organization or new.barangay is distinct from old.barangay then
    s := split_org_barangay(new.organization);
    v_org := s.org;
    v_brgy := null;
    if nullif(btrim(coalesce(new.barangay, '')), '') is not null then
      v_brgy := find_barangay(new.barangay);
      if v_brgy is null then
        -- "KBDM - Salitran IV" typed in the Barangay box
        t := split_org_barangay(new.barangay);
        if t.barangay_id is null then
          raise exception 'Barangay "%" is not in the barangay list. Choose one from the list (an administrator can add missing barangays in Admin › Barangays & organizations).', btrim(new.barangay)
            using errcode = 'check_violation';
        end if;
        v_brgy := t.barangay_id;
        v_org := coalesce(v_org, t.org);
      end if;
    end if;
    new.barangay_id := coalesce(v_brgy, s.barangay_id);
    new.organization_id := organization_id_of(v_org);
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

-- ---------------------------------------------------------------------
-- 3. "Received by": SPM name instead of "Office of SPM …"
-- ---------------------------------------------------------------------
create or replace function public.office_short_name(c committees)
returns text language sql immutable as $$
  select coalesce(
    'SPM ' || nullif(btrim(c.spm_name), ''),
    nullif(btrim(regexp_replace(c.name, '^\s*office\s+of\s+(the\s+)?', '', 'i')), ''),
    c.name);
$$;

create or replace view public.entry_list with (security_invoker = true) as
select e.*,
       o.name  as organization,
       b.name  as barangay,
       public.office_short_name(rc) as received_by
  from public.entries e
  left join public.organizations o on o.id = e.organization_id
  left join public.barangays b     on b.id = e.barangay_id
  left join public.committees rc   on rc.id = e.received_committee_id;

do $$
declare c record;
begin
  for c in select column_name, column_default from information_schema.columns
            where table_schema = 'public' and table_name = 'entries' and column_default is not null loop
    execute format('alter view public.entry_list alter column %I set default %s', c.column_name, c.column_default);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Clean up existing data (runs as the database owner; the activity log is paused for it)
-- ---------------------------------------------------------------------
alter table public.entries disable trigger user;
do $$
declare
  r record;
  s record;
  v_org uuid;
begin
  -- 4a. organizations that are really "organization - barangay", or just a barangay
  for r in select id, name from organizations loop
    s := split_org_barangay(r.name);
    if s.barangay_id is not null then
      v_org := organization_id_of(s.org);
      update entries set organization_id = v_org, barangay_id = coalesce(barangay_id, s.barangay_id) where organization_id = r.id;
      if v_org is distinct from r.id then delete from organizations where id = r.id; end if;
    end if;
  end loop;

  -- 4b. "barangays" that are really "organization - barangay" (made from free text before)
  for r in select id, name from barangays loop
    s := split_org_barangay(r.name, r.id);
    if s.barangay_id is not null and s.org is not null then
      update entries set barangay_id = s.barangay_id,
                         organization_id = coalesce(organization_id, organization_id_of(s.org))
       where barangay_id = r.id;
      update barangay_budgets bb set barangay_id = s.barangay_id
       where bb.barangay_id = r.id
         and not exists (select 1 from barangay_budgets x where x.year = bb.year and x.barangay_id = s.barangay_id);
      delete from barangay_budgets where barangay_id = r.id;
      delete from barangays where id = r.id;
    end if;
  end loop;
end $$;
alter table public.entries enable trigger user;

-- ---------------------------------------------------------------------
-- 5. Admin: merge a duplicate / misspelled barangay into the right one
-- ---------------------------------------------------------------------
create or replace function public.merge_barangays(p_from int, p_into int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can merge barangays.';
  end if;
  if p_from = p_into or not exists (select 1 from barangays where id = p_into) then
    raise exception 'Choose two different barangays.';
  end if;
  update entries set barangay_id = p_into where barangay_id = p_from; -- admins may change locked records
  update barangay_budgets bb set barangay_id = p_into
   where bb.barangay_id = p_from and not exists (select 1 from barangay_budgets x where x.year = bb.year and x.barangay_id = p_into);
  delete from barangay_budgets where barangay_id = p_from;
  delete from barangays where id = p_from;
end $$;

-- Barangay budgets: only official barangays.
create or replace function public.save_barangay_budget(p_year int, p_barangay text, p_brgy numeric, p_sk numeric, p_remarks text)
returns void language plpgsql security invoker set search_path = public as $$
declare v_b int := find_barangay(p_barangay);
begin
  if v_b is null then
    raise exception 'Barangay "%" is not in the barangay list.', p_barangay using errcode = 'check_violation';
  end if;
  insert into barangay_budgets (year, barangay_id, brgy_budget, sk_budget, remarks, updated_at)
  values (p_year, v_b, p_brgy, p_sk, p_remarks, now())
  on conflict (year, barangay_id) do update
    set brgy_budget = excluded.brgy_budget, sk_budget = excluded.sk_budget, remarks = excluded.remarks, updated_at = now();
end $$;

-- ---------------------------------------------------------------------
-- 6. Weekly published list: only records inside the From–To dates
--    (by date received, or by the date the office transmitted them)
-- ---------------------------------------------------------------------
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
  select v_id, x.id, row_number() over (order by x.ord)
    from unnest(p_entry_ids) with ordinality as x(id, ord)
    join entries e on e.id = x.id and e.status = 'transmitted'
    left join transmittals t on t.id = e.transmittal_id
   where e.date_received between p_from and p_to
      or t.transmitted_on between p_from and p_to;
  if not exists (select 1 from publication_entries where publication_id = v_id) then
    raise exception 'None of these records falls between % and %.', p_from, p_to;
  end if;
  perform public.log_publication(v_id);
  return v_id;
end $$;
