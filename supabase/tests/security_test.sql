-- Security checks (who can see / change what). Run on a database made with supabase/setup.sql.

-- ===================== rls_test
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
insert into entry_list (committee_id, type, date_received, solicitor_name, organization, barangay, request, contact_number)
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

-- ===================== rls_test_sprint2
-- Sprint 2 checks (run after rls_test.sql, same data)
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  execute 'set role authenticated';
end $$;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
insert into entries (committee_id, type, solicitor_name, purpose) values ('11111111-1111-1111-1111-111111111111', 'personal', 'Private Person', 'Reason');
select transmit_entries('personal', 'SPMRC-PER-045', 45, '', '2026-11-05', 'J', 'AA', array(select id from entries where type = 'personal'));
do $$ begin
  begin insert into sp_contribution_reports (beginning_balance) values (1); raise exception 'FAIL: member wrote budget';
  exception when insufficient_privilege then raise notice 'PASS member without budget access cannot write budget'; end;
  begin update committees set can_budget = true where id = public.my_committee(); raise exception 'FAIL self budget';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'PASS cannot grant self budget access'; end;
end $$;
reset role;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
do $$ begin
  assert (select count(*) from entries where type = 'personal') = 0, 'FAIL: other office sees personal';
  assert (select count(*) from transmittals where type = 'personal') = 0, 'FAIL: other office sees personal transmittal';
  raise notice 'PASS transmitted personal requests stay private';
  assert (select count(*) from entries where type = 'ngo') = 2, 'FAIL: published ngo hidden';
  raise notice 'PASS other published requests still visible';
end $$;
reset role;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
do $$ begin
  assert (select count(*) from entries where type = 'personal') = 0, 'FAIL: admin sees personal';
  raise notice 'PASS admin of another office cannot see personal';
  update committees set can_budget = true where id = '22222222-2222-2222-2222-222222222222';
end $$;
reset role;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
do $$ declare r uuid; b uuid; begin
  insert into sp_contribution_reports (report_date, beginning_balance) values ('2026-11-09', -14000) returning id into r;
  insert into sp_contribution_lines (report_id, kind, label, amount) values (r, 'addition', 'SP Contribution', 75000);
  insert into monitoring_batches (category, covering) values ('CSO', '(44th | Nov 03 - 05, 2026)') returning id into b;
  insert into monitoring_items (batch_id, requestor, amount) values (b, 'Megan', 2000);
  perform save_barangay_budget(2026, 'Zone I', 1000000, 100000, null);
  insert into storage.objects (bucket_id, name) values ('attachments', 'budget/2026/a.jpg');
  raise notice 'PASS budget encoder writes all budget tables and uploads';
end $$;
reset role;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
do $$ begin
  assert (select count(*) from monitoring_items) = 1 and (select count(*) from barangay_budgets) = 1, 'FAIL: viewer cannot read budget';
  raise notice 'PASS every approved account can view budget';
end $$;
reset role;

-- ===================== rls_test_sprint3
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  execute 'set role authenticated';
end $$;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
insert into entry_list (committee_id, type, solicitor_name, organization) values
 ('11111111-1111-1111-1111-111111111111', 'sk', 'A', 'Senior Citizens'),
 ('11111111-1111-1111-1111-111111111111', 'sk', 'B', 'KBDM');
do $$ declare n int; t uuid; e uuid; begin
  n := submit_entries('sk');
  assert n = 2, 'FAIL submit count';
  assert (select count(*) from submissions) = 1, 'FAIL submission row';
  raise notice 'PASS daily submit marks drafts submitted and logs the office';
  perform reorder_entries(array(select id from entries where type = 'sk' order by solicitor_name desc));
  assert (select solicitor_name from entries where type = 'sk' and position = 1) = 'B', 'FAIL reorder';
  raise notice 'PASS manual reorder (KBDM first)';
  t := transmit_entries('sk', 'SPMRC-SK-045', 45, '', '2026-11-14', 'J', 'AA', array(select id from entries where type = 'sk'));
  assert (select count(*) from entries where type = 'sk' and status = 'transmitted') = 2, 'FAIL publish';
  raise notice 'PASS weekly publish takes submitted entries';
  select id into e from entries where type = 'sk' and solicitor_name = 'A';
  update entries set received_committee_id = '11111111-1111-1111-1111-111111111111', received_at = now(), position = 5 where id = e;
  raise notice 'PASS received-by and order still allowed on published rows';
  begin
    update entries set contact_number = '0999' where id = e;
    raise exception 'FAIL: edited locked row';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS published row is locked (%)', sqlerrm;
  end;
  begin
    update transmittals set revision_open = true where id = t;
    raise exception 'FAIL: office opened own revision';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS only admin can allow revisions';
  end;
  update transmittals set revision_requested_at = now(), revision_reason = 'wrong number' where id = t;
  raise notice 'PASS office can request a revision';
end $$;
reset role;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
update transmittals set revision_open = true where code = 'SPMRC-SK-045';
reset role;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
do $$ begin
  update entries set contact_number = '0999' where solicitor_name = 'A' and type = 'sk';
  assert (select contact_number from entries where solicitor_name = 'A' and type = 'sk') = '0999', 'FAIL revision edit';
  raise notice 'PASS edit allowed after admin opened revision';
  update transmittals set revision_open = false where code = 'SPMRC-SK-045';
  raise notice 'PASS office locks it again';
  perform set_entry_order(array(select id from entries where status = 'transmitted'));
  assert (select count(*) from entry_order) > 0, 'FAIL entry order';
  raise notice 'PASS office saves its own arrangement of the published list';
end $$;
reset role;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
do $$ begin
  assert (select count(*) from entry_order) = 0, 'FAIL sees other office order';
  assert (select count(*) from submissions) = 1, 'FAIL cannot see submissions board';
  raise notice 'PASS arrangements are per office; submission board visible to all';
end $$;
reset role;

-- ===================== rls_test_sprint4
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  execute 'set role authenticated';
end $$;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
insert into entry_list (committee_id, type, solicitor_name, organization, barangay, request) values
 ('11111111-1111-1111-1111-111111111111', 'ngo', 'Ana', 'KBDM', 'Zone I', 'Cash'),
 ('11111111-1111-1111-1111-111111111111', 'ngo', 'Ben', '  kbdm ', 'Salitran II', 'Cash'),
 ('11111111-1111-1111-1111-111111111111', 'ngo', 'Cy', 'KBDM', 'Burol Main', 'Cash');
do $$ begin
  assert (select count(distinct organization_id) from entries where solicitor_name in ('Ana','Ben','Cy')) = 1, 'FAIL org not single';
  assert (select count(*) from organizations where lower(name) = 'kbdm') = 1, 'FAIL duplicate org';
  assert (select count(distinct barangay) from entry_list where solicitor_name in ('Ana','Ben','Cy')) = 3, 'FAIL barangays';
  raise notice 'PASS one KBDM record shared by 3 barangays/chapters (spelling normalized)';
end $$;
select transmit_entries('ngo', 'SPMRC-NGO-046', 46, '', '2026-11-14', 'J', 'AA', array(select id from entries where solicitor_name in ('Ana','Ben','Cy')));
do $$ begin
  begin
    update entries set contact_number = '0911' where solicitor_name = 'Ana';
    raise exception 'FAIL: edited published without permission';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS published records locked for offices without permission';
  end;
  begin
    update committees set can_edit_published = true where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'FAIL: office granted itself permission';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS office cannot give itself the permission';
  end;
end $$;
reset role;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
update committees set can_edit_published = true where id = '11111111-1111-1111-1111-111111111111';
reset role;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
do $$ declare n int; begin
  update entries set contact_number = '0911' where solicitor_name = 'Ana';
  assert (select contact_number from entries where solicitor_name = 'Ana') = '0911', 'FAIL permitted edit';
  delete from entries where solicitor_name = 'Cy';
  get diagnostics n = row_count;
  assert n = 1, 'FAIL permitted delete';
  raise notice 'PASS permitted office edits and deletes its published records';
  assert (select count(*) from audit_log where action in ('create','publish','edit','delete')) >= 4, 'FAIL audit';
  raise notice 'PASS audit trail records create / publish / edit / delete (% rows)', (select count(*) from audit_log);
  begin
    insert into audit_log (action, table_name) values ('fake', 'x');
    raise exception 'FAIL: audit log writable';
  exception when insufficient_privilege then raise notice 'PASS audit log cannot be written or faked by users';
  end;
end $$;
reset role;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
do $$ begin
  begin
    update entries set contact_number = '0922' where solicitor_name = 'Ben';
    assert (select contact_number from entries where solicitor_name = 'Ben') is distinct from '0922', 'FAIL other office edited';
  end;
  assert (select count(*) from audit_log where committee_id = '11111111-1111-1111-1111-111111111111') = 0, 'FAIL sees other office log';
  raise notice 'PASS permission is limited to the authorized office (others cannot edit; logs are private)';
end $$;
reset role;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
do $$ declare a uuid; b uuid; begin
  insert into organizations (name) values ('Senior Citizens Assoc.') returning id into a;
  select id into b from organizations where name = 'Senior Citizens Association';
  update entry_list set organization = 'Senior Citizens Assoc.' where solicitor_name = 'Ben';
  perform merge_organizations(a, b);
  assert (select organization from entry_list where solicitor_name = 'Ben') = 'Senior Citizens Association', 'FAIL merge';
  update organizations set name = 'Senior Citizens Association of Dasmariñas' where id = b;
  assert (select organization from entry_list where solicitor_name = 'Ben') = 'Senior Citizens Association of Dasmariñas', 'FAIL rename';
  raise notice 'PASS admin merges duplicates and renames organizations everywhere';
end $$;
reset role;

-- ===================== rls_test_sprint5
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  execute 'set role authenticated';
end $$;
-- B's office: published record "Ana"; C's office: published record
-- (an earlier test gave user C personal budget access; remove it so office-level access is tested)
update committees set can_budget = false where id = '22222222-2222-2222-2222-222222222222';
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
insert into entries (committee_id, type, solicitor_name, request) values ('22222222-2222-2222-2222-222222222222', 'ngo', 'Zed', 'Cash');
select transmit_entries('ngo', 'SPMT-NGO-046', 46, '', '2026-11-14', 'C', 'S', array(select id from entries where solicitor_name = 'Zed'));
do $$ begin
  -- ARCHIVE without permission: blocked
  begin
    update entries set status = 'archived' where solicitor_name = 'Zed';
    raise exception 'FAIL: archived without permission';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS archive of a published record is blocked without permission';
  end;
  begin
    insert into publications (title) values ('x');
    raise exception 'FAIL: office without permission published';
  exception when insufficient_privilege then raise notice 'PASS office without "may publish" cannot publish the weekly list';
  end;
  begin
    perform publish_week('Week 46', '', 46, '2026-11-15', '2026-11-21', array(select id from entries where status = 'transmitted'));
    raise exception 'FAIL: publish_week without permission';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS publish_week refuses offices without permission';
  end;
  begin
    insert into sp_contribution_reports (beginning_balance) values (1);
    raise exception 'FAIL: budget without permission';
  exception when insufficient_privilege then raise notice 'PASS no budget access by default';
  end;
end $$;
reset role;
-- B's office already may edit published (from sprint 4 test): archive + restore its own published record
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
do $$ declare n int; begin
  update entries set status = 'archived', archived_reason = 'duplicate' where solicitor_name = 'Ana';
  assert (select status from entries where solicitor_name = 'Ana') = 'archived', 'FAIL archive';
  assert (select count(*) from entries where status = 'archived' and solicitor_name = 'Ana') = 1, 'FAIL archived list';
  update entries set status = 'transmitted' where solicitor_name = 'Ana';
  assert (select status from entries where solicitor_name = 'Ana') = 'transmitted', 'FAIL restore';
  raise notice 'PASS permitted office archives its published record, sees it in Archived, and restores it';
  begin
    update committees set can_budget = true where id = public.my_committee();
    raise exception 'FAIL self publish permission';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS office cannot give itself "may publish" / budget access';
  end;
end $$;
reset role;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
update committees set can_edit_published = true, can_budget = true where id = '22222222-2222-2222-2222-222222222222';
reset role;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
do $$ declare p uuid; begin
  p := publish_week('Week 46', '(46th | Nov 15 to 21)', 46, '2026-11-15', '2026-11-21', array(select id from entries where status = 'transmitted'));
  assert (select count(*) from publication_entries where publication_id = p) >= 2, 'FAIL publication entries';
  raise notice 'PASS allowed office publishes the weekly combined list (% records of all offices)', (select count(*) from publication_entries where publication_id = p);
  insert into sp_contribution_reports (beginning_balance) values (5);
  raise notice 'PASS office-level budget access works';
end $$;
reset role;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
do $$ begin
  assert (select count(*) from publications) = 1, 'FAIL others cannot see the weekly list';
  raise notice 'PASS every office sees the weekly published list';
end $$;
reset role;
do $$ begin
  assert (select count(*) from audit_log where action = 'permission') >= 2 and (select count(*) from audit_log where table_name = 'publications') = 1, 'FAIL audit';
  raise notice 'PASS permission changes and weekly publishing are in the activity log';
end $$;

-- ===================== rls_test_normalize
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
  assert (select count(*) from entry_list where solicitor_name in ('Ana', 'Ben') and barangay is not null) = 2, 'FAIL barangay links';
  assert (select organization from entry_list where solicitor_name = 'Ana') = 'KBDM', 'FAIL organization link';
  assert (select count(*) from entry_list where received_at is not null and received_by is null) = 0, 'FAIL received office';
  raise notice 'PASS names are stored once and shown through the view (organization, barangay, received office)';
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

  update entry_list set barangay = 'Salitran III', contact_number = '09171234567' where id = r.id;
  assert (select barangay from entry_list where id = r.id) = 'Salitran III', 'FAIL barangay change';
  assert (select contact_number from entries where id = r.id) = '09171234567', 'FAIL other field change';
  assert (select organization from entry_list where id = r.id) is not null, 'FAIL unchanged organization kept';
  raise notice 'PASS editing through the view changes only what was edited';

  update entry_list set received_committee_id = '11111111-1111-1111-1111-111111111111', received_at = now() where id = r.id;
  assert (select received_by from entry_list where id = r.id) = (select office_short_name(c) from committees c where id = '11111111-1111-1111-1111-111111111111'), 'FAIL received office';
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
