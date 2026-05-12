create table company_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000001',
  company_name text,
  address_street text,
  address_postal text,
  address_city text,
  address_country text,
  phone text,
  email text,
  updated_at timestamptz default now()
);

alter table company_settings enable row level security;

create policy "authenticated_read_company_settings"
  on company_settings for select to authenticated using (true);

create policy "authenticated_write_company_settings"
  on company_settings for all to authenticated using (true);

-- Vaste rij zodat er altijd één row bestaat
insert into company_settings (id) values ('00000000-0000-0000-0000-000000000001')
  on conflict (id) do nothing;
