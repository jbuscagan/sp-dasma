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
  begin update profiles set can_budget = true where id = auth.uid(); raise exception 'FAIL self budget';
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
  update profiles set can_budget = true where email = 'c@x';
end $$;
reset role;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
do $$ declare r uuid; b uuid; begin
  insert into sp_contribution_reports (report_date, beginning_balance) values ('2026-11-09', -14000) returning id into r;
  insert into sp_contribution_lines (report_id, kind, label, amount) values (r, 'addition', 'SP Contribution', 75000);
  insert into monitoring_batches (category, covering) values ('CSO', '(44th | Nov 03 - 05, 2026)') returning id into b;
  insert into monitoring_items (batch_id, requestor, amount) values (b, 'Megan', 2000);
  insert into barangay_budgets (year, barangay, brgy_budget, sk_budget) values (2026, 'Zone I', 1000000, 100000);
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
