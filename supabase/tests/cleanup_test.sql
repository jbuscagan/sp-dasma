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
  assert (select count(*) from transmittals where type = 'medical' and week_no = 30) = 1, 'FAIL duplicate weeks not merged';
  assert not exists (select 1 from committees where btrim(name) = ''), 'FAIL blank office left';
  raise notice 'PASS the blank (unused) office was removed';
  raise notice 'PASS duplicate transmittals of the same week were merged into one';
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
delete from publications;  -- start without weekly lists (a record is published once only)
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

-- ---------- full SPM name in "Received by"; removing barangays / organizations ----------
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
do $$ declare v uuid; nb int; no int; n int; begin
  update committees set spm_full_name = 'Robin Chester J. Cantimbuhan' where id = '11111111-1111-1111-1111-111111111111';
  select id into v from entry_list where received_committee_id = '11111111-1111-1111-1111-111111111111' limit 1;
  assert (select received_by from entry_list where id = v) = 'SPM Robin Chester J. Cantimbuhan', 'FAIL full name';
  update committees set spm_full_name = null where id = '11111111-1111-1111-1111-111111111111';
  assert (select received_by from entry_list where id = v) not like 'Office of%' and (select received_by from entry_list where id = v) like 'SPM %', 'FAIL fallback';
  raise notice 'PASS without a full name it uses the office name: %', (select received_by from entry_list where id = v);
  update committees set spm_full_name = 'Robin Chester J. Cantimbuhan' where id = '11111111-1111-1111-1111-111111111111';
  raise notice 'PASS received by shows the full name: %', (select received_by from entry_list where id = v);

  insert into barangays (name) values ('Not Really A Barangay');
  update entries set barangay_id = (select id from barangays where name = 'Not Really A Barangay') where solicitor_name = 'Mixed Org';
  n := (select count(*) from audit_log);
  perform remove_barangays(array[(select id from barangays where name = 'Not Really A Barangay')]);
  assert not exists (select 1 from barangays where name = 'Not Really A Barangay'), 'FAIL remove barangay in use';
  assert (select barangay_id from entries where solicitor_name = 'Mixed Org') is null, 'FAIL request still linked';
  assert (select count(*) from audit_log) = n + 1, 'FAIL one summary line';
  raise notice 'PASS a barangay in use can be removed (its requests just show no barangay; one activity-log line)';

  select count(*) into nb from barangays;
  select count(*) into no from organizations;
  perform remove_organizations(null);
  perform remove_barangays(null);
  assert (select count(*) from barangays) = 0 and (select count(*) from organizations) = 0, 'FAIL remove all';
  assert (select count(*) from entries) > 0, 'FAIL requests lost';
  raise notice 'PASS remove all (% barangays, % organizations); requests are kept', nb, no;
end $$;
reset role;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
do $$ begin
  begin
    perform remove_organizations(null);
    raise exception 'FAIL member removed organizations';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS only an administrator can remove barangays / organizations';
  end;
end $$;
reset role;

-- ---------- one transmittal per week, submitted visible to all, publish by date, unpublish, delete office ----------
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
do $$ declare t1 uuid; t2 uuid; begin
  insert into entries (committee_id, type, solicitor_name, request, status, date_received) values
    ('11111111-1111-1111-1111-111111111111', 'sk', 'Week Mon', 'Cash', 'draft', '2026-11-16'),
    ('11111111-1111-1111-1111-111111111111', 'sk', 'Week Wed', 'Cash', 'draft', '2026-11-18');
  t1 := transmit_entries('sk', 'SPMRC-SK-047', 47, '(47th)', '2026-11-16', 'B', 'S', array(select id from entries where solicitor_name = 'Week Mon'));
  t2 := transmit_entries('sk', 'SPMRC-SK-047', 47, '(47th | Nov 16 to 18)', '2026-11-18', 'B', 'S', array(select id from entries where solicitor_name = 'Week Wed'));
  assert t1 = t2, 'FAIL second transmittal for the same week';
  assert (select count(*) from transmittals where type = 'sk' and week_no = 47) = 1, 'FAIL duplicate week';
  assert (select count(*) from entries where transmittal_id = t1) = 2, 'FAIL entries not together';
  raise notice 'PASS transmitting twice in one week keeps ONE transmittal (both requests in it)';

  insert into entries (committee_id, type, solicitor_name, request, status) values ('11111111-1111-1111-1111-111111111111', 'ngo', 'Submitted Today', 'Cash', 'submitted');
end $$;
reset role;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
do $$ begin
  assert exists (select 1 from entry_list where solicitor_name = 'Submitted Today'), 'FAIL submitted not visible';
  assert not exists (select 1 from entry_list where status = 'draft' and committee_id = '11111111-1111-1111-1111-111111111111'), 'FAIL drafts visible';
  raise notice 'PASS submitted requests appear for every office (drafts stay private)';
end $$;
reset role;
alter table entries disable trigger user;
update entries set date_received = '2026-11-09' where solicitor_name = 'Week Mon';  -- received the week before
alter table entries enable trigger user;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
do $$ declare p uuid; begin
  p := publish_week('Week 47', '', 47, '2026-11-15', '2026-11-21', array(select id from entries where solicitor_name in ('Week Mon', 'Week Wed')), 'received');
  assert (select count(*) from publication_entries where publication_id = p) = 1, 'FAIL other week included (by date received)';
  raise notice 'PASS publishing by date received leaves out records of other weeks';
  begin
    perform publish_week('Week 47 again', '', 47, '2026-11-15', '2026-11-21', array(select id from entries where solicitor_name in ('Week Mon', 'Week Wed')), 'received');
    raise exception 'FAIL published twice';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS a record that is already in a weekly list is not published again';
  end;
  delete from publications where id = p;
  assert not exists (select 1 from publications where id = p), 'FAIL unpublish';
  raise notice 'PASS an office allowed to publish can unpublish';
end $$;
reset role;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
do $$ declare c uuid; begin
  insert into committees (name) values ('Temporary Office') returning id into c;
  perform remove_office(c);
  assert not exists (select 1 from committees where id = c), 'FAIL empty office not deleted';
  begin
    perform remove_office('11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL office in use deleted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS an empty office can be deleted; an office in use cannot';
  end;
end $$;
reset role;
