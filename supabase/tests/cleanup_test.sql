-- Organization only / barangay only, "Received by", weekly dates. Run after cleanup_test_data.sql and setup.sql again.
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  execute 'set role authenticated';
end $$;

do $$ begin
  assert place_key('Brgy. Sta. Cruz 2') = place_key('Santa Cruz II'), 'FAIL place key';
  assert find_barangay('brgy zone 1') = (select id from barangays where name = 'Zone I'), 'FAIL find barangay';
  assert (select org from split_org_barangay('KBDM - Zone I')) = 'KBDM', 'FAIL split org';
  assert (select barangay_id from split_org_barangay('KBDM of Brgy. Zone I')) = find_barangay('Zone I'), 'FAIL split "of Brgy."';
  assert (select org from split_org_barangay('Barangay Zone I')) is null, 'FAIL barangay as org';
  assert (select org from split_org_barangay('Tau Gamma Phi')) = 'Tau Gamma Phi', 'FAIL plain org';
  raise notice 'PASS names are split into organization and barangay';

  assert (select organization from entry_list where solicitor_name = 'Mixed Org') = 'Youth Club', 'FAIL cleanup org';
  assert (select barangay from entry_list where solicitor_name = 'Mixed Org') = 'Zone I', 'FAIL cleanup org barangay';
  assert (select organization from entry_list where solicitor_name = 'Mixed Brgy') = 'Seniors Club', 'FAIL cleanup barangay org';
  assert (select barangay from entry_list where solicitor_name = 'Mixed Brgy') = 'Zone I', 'FAIL cleanup barangay';
  assert not exists (select 1 from barangays where name like '% - %'), 'FAIL mixed barangay left';
  assert not exists (select 1 from organizations where name in ('Youth Club - Zone I', 'Barangay Salitran II')), 'FAIL mixed organization left';
  assert (select organization from entry_list where solicitor_name = 'Brgy As Org') is null
     and (select barangay from entry_list where solicitor_name = 'Brgy As Org') = 'Salitran II', 'FAIL barangay stored as organization';
  raise notice 'PASS existing mixed organization/barangay records were cleaned up';
end $$;

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
do $$
declare r record;
begin
  insert into entry_list (committee_id, type, solicitor_name, organization, request)
  values ('11111111-1111-1111-1111-111111111111', 'ngo', 'Split Me', 'Eagles Club - brgy zone 1', 'Cash') returning * into r;
  assert r.organization = 'Eagles Club' and r.barangay = 'Zone I', 'FAIL split on save';
  update entry_list set organization = null, barangay = 'Lions Club - Salitran 2' where id = r.id;
  assert (select organization from entry_list where id = r.id) = 'Lions Club' and (select barangay from entry_list where id = r.id) = 'Salitran II', 'FAIL split from barangay box';
  raise notice 'PASS "Organization - Barangay" typed in either box is saved as two separate fields';
  begin
    update entry_list set barangay = 'Not A Real Place' where id = r.id;
    raise exception 'FAIL unknown barangay accepted';
  exception when check_violation then raise notice 'PASS a barangay outside the official list is refused';
  end;
  assert not exists (select 1 from barangays where name = 'Not A Real Place'), 'FAIL junk barangay created';
  update entry_list set received_committee_id = '11111111-1111-1111-1111-111111111111', received_at = now() where id = r.id;
  assert (select received_by from entry_list where id = r.id) not ilike 'office of%', 'FAIL received by still says Office of';
  raise notice 'PASS received by shows the SPM name: %', (select received_by from entry_list where id = r.id);
end $$;
reset role;

-- weekly list keeps only records inside its dates
update entries set date_received = '2026-11-02' where solicitor_name = 'Ana';
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
do $$ declare p uuid; n int; begin
  select count(*) into n from entries where status = 'transmitted';
  p := publish_week('Week 45', '', 45, '2026-11-01', '2026-11-07', array(select id from entries where status = 'transmitted'));
  assert (select count(*) from publication_entries where publication_id = p) < n, 'FAIL other weeks included';
  assert exists (select 1 from publication_entries pe join entries e on e.id = pe.entry_id where pe.publication_id = p and e.solicitor_name = 'Ana'), 'FAIL record of the week missing';
  raise notice 'PASS weekly list takes only records of the chosen week (% of %)', (select count(*) from publication_entries where publication_id = p), n;
  begin
    perform publish_week('Week 1', '', 1, '2020-01-01', '2020-01-07', array(select id from entries where status = 'transmitted'));
    raise exception 'FAIL empty week published';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS a week with no records is not published';
  end;
end $$;
reset role;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
do $$ declare a int; b int; begin
  insert into barangays (name) values ('Zone One Typo') returning id into a;
  b := find_barangay('Zone I');
  update entries set barangay_id = a where solicitor_name = 'Mixed Org';
  perform merge_barangays(a, b);
  assert (select barangay from entry_list where solicitor_name = 'Mixed Org') = 'Zone I' and not exists (select 1 from barangays where id = a), 'FAIL merge barangays';
  raise notice 'PASS admin merges a misspelled barangay into the right one';
end $$;
reset role;
