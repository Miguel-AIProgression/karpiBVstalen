-- Update bundle config names (remove order numbers)
update public.bundle_configs set name = 'Headlam 30x50'
  where id = 'bc000000-0000-0000-0000-000000000001';
update public.bundle_configs set name = 'Headlam 30x50 uitgebreid'
  where id = 'bc000000-0000-0000-0000-000000000002';
update public.bundle_configs set name = 'Headlam 40x40'
  where id = 'bc000000-0000-0000-0000-000000000003';

-- Update GALA bundle config names (remove order references)
update public.bundle_configs set name = 'GALA — Klant 500009'
  where id = 'bc000000-0000-0000-0000-000000000009';
update public.bundle_configs set name = 'GALA — Klant 500010'
  where id = 'bc000000-0000-0000-0000-000000000010';
update public.bundle_configs set name = 'GALA — Klant 500011'
  where id = 'bc000000-0000-0000-0000-000000000011';
update public.bundle_configs set name = 'GALA — Klant 500012'
  where id = 'bc000000-0000-0000-0000-000000000012';
update public.bundle_configs set name = 'GALA — Klant 500013'
  where id = 'bc000000-0000-0000-0000-000000000013';
update public.bundle_configs set name = 'GALA — Klant 500014'
  where id = 'bc000000-0000-0000-0000-000000000014';
update public.bundle_configs set name = 'GALA — Klant 500015'
  where id = 'bc000000-0000-0000-0000-000000000015';

-- Example project for Headlam
insert into public.projects (id, client_id, name) values
  ('aa000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Stalenset Voorjaar 2026');

-- Example requests for Headlam
insert into public.bundle_requests (project_id, bundle_config_id, quantity) values
  ('aa000000-0000-0000-0000-000000000001', 'bc000000-0000-0000-0000-000000000001', 10),
  ('aa000000-0000-0000-0000-000000000001', 'bc000000-0000-0000-0000-000000000003', 5);

-- GALA projects per client
insert into public.projects (id, client_id, name) values
  ('aa000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000009', 'GALA Stalen 2026'),
  ('aa000000-0000-0000-0000-000000000010', 'f0000000-0000-0000-0000-000000000010', 'GALA Stalen 2026'),
  ('aa000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000011', 'GALA Stalen 2026'),
  ('aa000000-0000-0000-0000-000000000012', 'f0000000-0000-0000-0000-000000000012', 'GALA Stalen 2026'),
  ('aa000000-0000-0000-0000-000000000013', 'f0000000-0000-0000-0000-000000000013', 'GALA Stalen 2026'),
  ('aa000000-0000-0000-0000-000000000014', 'f0000000-0000-0000-0000-000000000014', 'GALA Stalen 2026'),
  ('aa000000-0000-0000-0000-000000000015', 'f0000000-0000-0000-0000-000000000015', 'GALA Stalen 2026');

-- GALA requests (1 bundle each)
insert into public.bundle_requests (project_id, bundle_config_id, quantity) values
  ('aa000000-0000-0000-0000-000000000009', 'bc000000-0000-0000-0000-000000000009', 1),
  ('aa000000-0000-0000-0000-000000000010', 'bc000000-0000-0000-0000-000000000010', 1),
  ('aa000000-0000-0000-0000-000000000011', 'bc000000-0000-0000-0000-000000000011', 1),
  ('aa000000-0000-0000-0000-000000000012', 'bc000000-0000-0000-0000-000000000012', 1),
  ('aa000000-0000-0000-0000-000000000013', 'bc000000-0000-0000-0000-000000000013', 1),
  ('aa000000-0000-0000-0000-000000000014', 'bc000000-0000-0000-0000-000000000014', 1),
  ('aa000000-0000-0000-0000-000000000015', 'bc000000-0000-0000-0000-000000000015', 1);
