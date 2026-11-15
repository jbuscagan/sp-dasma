create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  execute 'set role authenticated';
end $$;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
insert into entries (committee_id, type, solicitor_name, organization) values
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
  update entries set received_by = 'Maria Clara', received_at = now(), position = 5 where id = e;
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
