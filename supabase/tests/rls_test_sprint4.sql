create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  execute 'set role authenticated';
end $$;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
insert into entries (committee_id, type, solicitor_name, organization, barangay, request) values
 ('11111111-1111-1111-1111-111111111111', 'ngo', 'Ana', 'KBDM', 'Zone I', 'Cash'),
 ('11111111-1111-1111-1111-111111111111', 'ngo', 'Ben', '  kbdm ', 'Salitran II', 'Cash'),
 ('11111111-1111-1111-1111-111111111111', 'ngo', 'Cy', 'KBDM', 'Burol Main', 'Cash');
do $$ begin
  assert (select count(distinct organization_id) from entries where solicitor_name in ('Ana','Ben','Cy')) = 1, 'FAIL org not single';
  assert (select count(*) from organizations where lower(name) = 'kbdm') = 1, 'FAIL duplicate org';
  assert (select count(distinct barangay) from entries where solicitor_name in ('Ana','Ben','Cy')) = 3, 'FAIL barangays';
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
  update entries set organization = 'Senior Citizens Assoc.' where solicitor_name = 'Ben';
  perform merge_organizations(a, b);
  assert (select organization from entries where solicitor_name = 'Ben') = 'Senior Citizens Association', 'FAIL merge';
  update organizations set name = 'Senior Citizens Association of Dasmariñas' where id = b;
  assert (select organization from entries where solicitor_name = 'Ben') = 'Senior Citizens Association of Dasmariñas', 'FAIL rename';
  raise notice 'PASS admin merges duplicates and renames organizations everywhere';
end $$;
reset role;
