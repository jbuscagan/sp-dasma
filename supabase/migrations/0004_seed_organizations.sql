-- Organizations found in the sample transmittals and monitoring sheets (a starting point).
-- Admins can import the official list in the app: Admin > Barangays & organizations > Import list.
insert into public.organizations (name, barangay) values
  ('Dasmariñas ThirdGen', 'Burol Main'),
  ('Senior Citizens Association', 'Saint Peter I'),
  ('PWD', 'Fatima III'),
  ('PWD', 'Salitran I'),
  ('Windsor Homes HOA', 'Burol III'),
  ('Solo Parent', 'Santa Cruz I'),
  ('Senior Citizens Affairs', 'Salitran III'),
  ('Senior Citizens of Molino Homes II Subdivision', 'Salitran III'),
  ('EAC - Marketing and Communication Office', 'Burol Main'),
  ('EAC - School of Nursing and Midwifery Student Council', 'Burol Main'),
  ('DIHS Alumni Association, Inc.', null),
  ('Salitran IV Integrated High School', 'Salitran IV'),
  ('SEVENONEDERS', null),
  ('Tau Gamma Phi Sabang Community Chapter', 'Sabang'),
  ('Glam N'' Groove Milestone', 'Sabang'),
  ('Saint Francis of Academy Parents Alliance', null)
on conflict (name, barangay) do nothing;
