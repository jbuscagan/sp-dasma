\set ON_ERROR_STOP 1
-- ---------- setup (as superuser) ----------
insert into committees (id, name, spm_name, code_prefix) values
 ('11111111-1111-1111-1111-111111111111', 'Office of SPM Robin Cantimbuhan', 'Robin Cantimbuhan', 'SPMRC'),
 ('22222222-2222-2222-2222-222222222222', 'Office of SPM Two', 'Two', 'SPMT');
insert into auth.users values
 ('aaaaaaaa-0000-0000-0000-000000000000', 'admin@x', '{"encoder_name":"Admin","position":"IT","requested_office":"SP"}'),
 ('bbbbbbbb-0000-0000-0000-000000000000', 'b@x', '{"encoder_name":"Joseph Aguilar","position":"Administrative Assistant","requested_office":"Office of SPM Robin Cantimbuhan"}'),
 ('cccccccc-0000-0000-0000-000000000000', 'c@x', '{"encoder_name":"C","position":"Staff","requested_office":"Office of SPM Two"}'),
 ('dddddddd-0000-0000-0000-000000000000', 'd@x', '{"encoder_name":"D","position":"Staff","requested_office":"New office"}');
select 'profiles created by trigger: ' || count(*) from profiles;
update profiles set role='admin', status='approved' where email='admin@x';
update profiles set status='approved', committee_id='11111111-1111-1111-1111-111111111111' where email='b@x';
update profiles set status='approved', committee_id='22222222-2222-2222-2222-222222222222' where email='c@x';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  execute 'set role authenticated';
end $$;

-- ---------- pending user D ----------
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000000');
do $$ begin
  begin
    insert into entries (committee_id, type, solicitor_name) values ('11111111-1111-1111-1111-111111111111', 'ngo', 'x');
    raise exception 'FAIL: pending user inserted';
  exception when insufficient_privilege then raise notice 'PASS pending user cannot insert';
  end;
end $$;
reset role;

-- ---------- B encodes drafts ----------
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
insert into entries (committee_id, type, date_received, solicitor_name, organization, barangay, request, contact_number)
values ('11111111-1111-1111-1111-111111111111', 'ngo', '2026-11-04', 'Alyssa Palomo', 'EAC', 'Salitran IV', 'Cash/In-Kind', '09691071334'),
       ('11111111-1111-1111-1111-111111111111', 'ngo', '2026-11-04', 'Nancy De Jesus', 'DIHS Alumni', 'Zone II', 'Cash', '09771431510');
do $$ begin
  begin
    insert into entries (committee_id, type, solicitor_name) values ('22222222-2222-2222-2222-222222222222', 'ngo', 'spoof');
    raise exception 'FAIL: B inserted into another office';
  exception when insufficient_privilege then raise notice 'PASS cannot encode for another office';
  end;
  begin
    update profiles set role = 'admin' where id = auth.uid();
    raise exception 'FAIL: B promoted self';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS cannot promote self (%)', sqlerrm;
  end;
end $$;
reset role;

-- ---------- C cannot see B drafts ----------
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
do $$ begin
  assert (select count(*) from entries) = 0, 'FAIL: C sees drafts of B';
  raise notice 'PASS drafts are private to the office';
end $$;
reset role;

-- ---------- B transmits ----------
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
select 'transmittal id: ' || transmit_entries('ngo', 'SPMRC-NGO-045', 45, '(45th | Nov 4 to 5)', '2026-11-05', 'Joseph Aguilar', 'Administrative Assistant',
  array(select id from entries where committee_id = '11111111-1111-1111-1111-111111111111'));
do $$ begin
  assert (select count(*) from entries where status = 'transmitted') = 2, 'FAIL: not transmitted';
  raise notice 'PASS transmit_entries moved 2 entries';
end $$;
reset role;

-- ---------- C sees published, can receive + flag, cannot edit ----------
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
do $$ declare n int; e uuid; begin
  assert (select count(*) from entries) = 2, 'FAIL: C cannot see published';
  raise notice 'PASS published entries visible to other offices';
  select id into e from entries limit 1;
  update entries set solicitor_name = 'hacked' where id = e;
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: C edited B entry';
  raise notice 'PASS other office cannot edit';
  insert into entry_receipts (entry_id, committee_id) values (e, '22222222-2222-2222-2222-222222222222');
  raise notice 'PASS mark received';
  begin
    insert into entry_receipts (entry_id, committee_id) values (e, '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: receipt for another office';
  exception when insufficient_privilege then raise notice 'PASS cannot mark received for another office';
  end;
  insert into entry_flags (entry_id, committee_id, note) values (e, '22222222-2222-2222-2222-222222222222', 'Number differs from our record');
  raise notice 'PASS flag raised';
  delete from entries where id = e;
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: C deleted B entry';
  raise notice 'PASS other office cannot delete';
end $$;
reset role;

-- ---------- B resolves the flag, cannot hard-delete transmitted ----------
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
do $$ declare n int; begin
  update entry_flags set status = 'resolved', resolution = 'Corrected' where status = 'open';
  get diagnostics n = row_count;
  assert n = 1, 'FAIL: owner could not resolve flag';
  raise notice 'PASS entry owner resolves flag';
  delete from entries where status = 'transmitted';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: transmitted entry hard-deleted';
  raise notice 'PASS transmitted entries can only be archived, not deleted';
  insert into employees (committee_id, name, position, dept) values ('11111111-1111-1111-1111-111111111111', 'Emerson Virata', 'Driver', 'SP');
  insert into storage.objects (bucket_id, name) values ('attachments', '11111111-1111-1111-1111-111111111111/2026-11-05/a.jpg');
  raise notice 'PASS upload into own folder';
  begin
    insert into storage.objects (bucket_id, name) values ('attachments', '22222222-2222-2222-2222-222222222222/a.jpg');
    raise exception 'FAIL: upload into other folder';
  exception when insufficient_privilege then raise notice 'PASS cannot upload into another office folder';
  end;
end $$;
reset role;

-- ---------- DTR is private per office; admin sees all ----------
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
do $$ begin
  assert (select count(*) from employees) = 0, 'FAIL: C sees B employees';
  raise notice 'PASS DTR employees private per office';
end $$;
reset role;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
do $$ begin
  assert (select count(*) from employees) = 1 and (select count(*) from profiles) = 4, 'FAIL: admin visibility';
  raise notice 'PASS admin sees everything';
end $$;
reset role;
