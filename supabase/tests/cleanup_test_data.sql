-- Creates mixed-up organization/barangay names; then run setup.sql again (its tidy-up must clean them) and cleanup_test.sql.
-- an earlier test renamed it
update barangays set name = 'Zone I' where name = 'Zone I (Pob.)';
alter table entries disable trigger user;
insert into barangays (name) values ('Seniors Club - Zone I') on conflict do nothing;
insert into organizations (name) values ('Youth Club - Zone I'), ('Barangay Salitran II') on conflict do nothing;
insert into entries (committee_id, type, solicitor_name, organization_id, barangay_id, status) values
  ('11111111-1111-1111-1111-111111111111', 'ngo', 'Mixed Org', (select id from organizations where name = 'Youth Club - Zone I'), null, 'draft'),
  ('11111111-1111-1111-1111-111111111111', 'ngo', 'Mixed Brgy', null, (select id from barangays where name = 'Seniors Club - Zone I'), 'draft'),
  ('11111111-1111-1111-1111-111111111111', 'barangay', 'Brgy As Org', (select id from organizations where name = 'Barangay Salitran II'), null, 'draft');
alter table entries enable trigger user;
