-- Checks for 0009 (normalized data). Run AFTER the other tests and 0009 (it re-uses their data).
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  execute 'set role authenticated';
end $$;

-- ---------- old data moved into links ----------
do $$ begin
  assert not exists (select 1 from information_schema.columns where table_name = 'entries' and column_name in ('organization', 'barangay', 'received_by')),
    'FAIL copied name columns still on entries';
  assert (select count(*) from entry_list where solicitor_name in ('Ana', 'Ben') and barangay is not null) = 2, 'FAIL barangays not moved';
  assert (select count(*) from entries where barangay_id is null and btrim(coalesce(solicitor_name, '')) = 'Ana') = 0, 'FAIL barangay link';
  assert (select organization from entry_list where solicitor_name = 'Ana') = 'KBDM', 'FAIL organization link';
  assert (select count(*) from entry_list where received_at is not null and received_by is null) = 0, 'FAIL received office not moved';
  assert (select count(*) from barangay_budgets where barangay_id is null) = 0, 'FAIL budget barangay link';
  raise notice 'PASS old names were moved into links (organization, barangay, received office, budgets)';
end $$;

-- ---------- saving through the view ----------
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
do $$
declare r record;
begin
  insert into entry_list (committee_id, type, solicitor_name, organization, barangay, request)
  values ('11111111-1111-1111-1111-111111111111', 'ngo', 'Normal Test', '  kbdm ', 'zone i', 'Cash')
  returning * into r;
  assert r.id is not null and r.status = 'draft' and r.date_received = current_date, 'FAIL defaults';
  assert r.organization = (select name from organizations where lower(name) = 'kbdm'), 'FAIL organization spelling';
  assert r.barangay = (select name from barangays where lower(name) = 'zone i'), 'FAIL barangay spelling';
  assert (select count(*) from organizations where lower(name) = 'kbdm') = 1, 'FAIL duplicate organization created';
  raise notice 'PASS new request saved through the view; names become links with the official spelling';

  update entry_list set barangay = 'Brand New Chapter', contact_number = '09171234567' where id = r.id;
  assert (select barangay from entry_list where id = r.id) = 'Brand New Chapter', 'FAIL barangay change';
  assert (select contact_number from entries where id = r.id) = '09171234567', 'FAIL other field change';
  assert (select organization from entry_list where id = r.id) is not null, 'FAIL unchanged organization kept';
  raise notice 'PASS editing through the view changes only what was edited';

  update entry_list set received_committee_id = '11111111-1111-1111-1111-111111111111', received_at = now() where id = r.id;
  assert (select received_by from entry_list where id = r.id) = (select name from committees where id = '11111111-1111-1111-1111-111111111111'), 'FAIL received office';
  assert (select action from audit_log where record_id = r.id order by id desc limit 1) = 'received', 'FAIL received log';
  raise notice 'PASS received shows the office name and is logged as "received"';

  delete from entry_list where id = r.id;
  assert not exists (select 1 from entries where id = r.id), 'FAIL delete through view';
  raise notice 'PASS delete through the view';
end $$;
reset role;

-- ---------- same security rules through the view ----------
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000000');
do $$ begin
  assert (select count(*) from entry_list) = 0, 'FAIL pending user sees requests';
  raise notice 'PASS pending account sees nothing through the view';
end $$;
reset role;

insert into entries (committee_id, type, solicitor_name, status) values ('22222222-2222-2222-2222-222222222222', 'personal', 'Private Person Two', 'draft');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
do $$ begin
  assert not exists (select 1 from entry_list where solicitor_name = 'Private Person Two'), 'FAIL personal privacy through view';
  raise notice 'PASS personal requests of other offices stay hidden through the view';
end $$;
reset role;

-- locked published record: office without permission cannot edit, but may mark received
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
update committees set can_edit_published = false where id = '11111111-1111-1111-1111-111111111111';
reset role;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
do $$
declare v uuid;
begin
  select id into v from entry_list where committee_id = '11111111-1111-1111-1111-111111111111' and status = 'transmitted' limit 1;
  assert v is not null, 'FAIL no published record to test';
  begin
    update entry_list set organization = 'Someone Else' where id = v;
    raise exception 'FAIL locked record edited through view';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS published record stays locked through the view';
  end;
  update entry_list set received_committee_id = '11111111-1111-1111-1111-111111111111', received_at = now() where id = v;
  raise notice 'PASS locked record can still be marked received';
end $$;
reset role;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
update committees set can_edit_published = true where id = '11111111-1111-1111-1111-111111111111';
reset role;

-- ---------- budgets & permissions ----------
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
do $$ begin
  perform save_barangay_budget(2027, 'zone i', 500, 50, null);
  perform save_barangay_budget(2027, 'Zone I', 600, 60, null);
  assert (select count(*) from barangay_budgets where year = 2027) = 1 and (select brgy_budget from barangay_budgets where year = 2027) = 600, 'FAIL budget upsert';
  raise notice 'PASS barangay budget saved once per barangay and year';
end $$;
reset role;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
do $$ begin
  begin
    perform save_barangay_budget(2027, 'Zone I', 1, 1, null);
    raise exception 'FAIL office without budget access saved a budget';
  exception when insufficient_privilege then raise notice 'PASS office without budget access cannot save budgets';
  end;
  assert not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'can_budget'), 'FAIL account-level budget flag';
  assert not exists (select 1 from information_schema.columns where table_name = 'committees' and column_name = 'can_publish'), 'FAIL separate publish flag';
  raise notice 'PASS each permission is stored in one place only';
end $$;
reset role;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
do $$ begin
  begin
    delete from barangays where id = (select barangay_id from entries where barangay_id is not null limit 1);
    raise exception 'FAIL used barangay deleted';
  exception when foreign_key_violation then raise notice 'PASS a barangay in use cannot be deleted (no request loses its barangay)';
  end;
  update barangays set name = 'Zone I (Pob.)' where lower(name) = 'zone i';
  assert exists (select 1 from entry_list where barangay = 'Zone I (Pob.)') or not exists (select 1 from entries e join barangays b on b.id = e.barangay_id where b.name = 'Zone I (Pob.)'), 'FAIL rename';
  raise notice 'PASS renaming a barangay updates every request at once';
end $$;
reset role;
