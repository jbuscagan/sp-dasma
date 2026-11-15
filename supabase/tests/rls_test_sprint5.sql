create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  execute 'set role authenticated';
end $$;
-- B's office: published record "Ana"; C's office: published record
-- (an earlier test gave user C personal budget access; remove it so office-level access is tested)
update profiles set can_budget = false where email = 'c@x';
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
    update committees set can_publish = true where id = public.my_committee();
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
