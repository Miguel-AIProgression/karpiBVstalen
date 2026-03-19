-- ============================================================
-- Sales Request Layer: tables, triggers, indexes, views, RLS
-- ============================================================

-- 1. Tables
-- ============================================================

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bundle_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  bundle_config_id uuid not null references public.bundle_configs(id),
  quantity integer not null check (quantity > 0),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bundle_reservations (
  id uuid primary key default gen_random_uuid(),
  bundle_request_id uuid not null references public.bundle_requests(id),
  quantity integer not null check (quantity > 0),
  reserved_at timestamptz not null default now()
);

-- 2. Indexes
-- ============================================================

create index idx_bundle_reservations_request on public.bundle_reservations(bundle_request_id);
create index idx_bundle_requests_config_status on public.bundle_requests(bundle_config_id, status);
create index idx_bundle_requests_project on public.bundle_requests(project_id);

-- 3. Updated_at triggers
-- ============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger trg_bundle_requests_updated_at
  before update on public.bundle_requests
  for each row execute function public.set_updated_at();

-- 4. Over-reservation protection trigger
-- ============================================================

create or replace function public.check_reservation_limit()
returns trigger as $$
declare
  v_request_qty integer;
  v_existing_reserved integer;
begin
  -- Lock the request row to prevent race conditions
  select quantity into v_request_qty
  from public.bundle_requests
  where id = new.bundle_request_id
  for update;

  if not found then
    raise exception 'Bundle request not found: %', new.bundle_request_id;
  end if;

  select coalesce(sum(quantity), 0) into v_existing_reserved
  from public.bundle_reservations
  where bundle_request_id = new.bundle_request_id;

  if v_existing_reserved + new.quantity > v_request_qty then
    raise exception 'Over-reservation: existing (%) + new (%) > requested (%)',
      v_existing_reserved, new.quantity, v_request_qty;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_check_reservation_limit
  before insert on public.bundle_reservations
  for each row execute function public.check_reservation_limit();

-- 5. Auto-status trigger (pending → ready when fully reserved)
-- ============================================================

create or replace function public.update_request_status_on_reservation()
returns trigger as $$
declare
  v_request_qty integer;
  v_total_reserved integer;
begin
  select br.quantity into v_request_qty
  from public.bundle_requests br
  where br.id = new.bundle_request_id;

  select coalesce(sum(quantity), 0) into v_total_reserved
  from public.bundle_reservations
  where bundle_request_id = new.bundle_request_id;

  if v_total_reserved >= v_request_qty then
    update public.bundle_requests
    set status = 'ready'
    where id = new.bundle_request_id
      and status = 'pending';
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_update_request_status
  after insert on public.bundle_reservations
  for each row execute function public.update_request_status_on_reservation();

-- 6. Cancellation trigger (delete reservations when cancelled)
-- ============================================================

create or replace function public.release_reservations_on_cancel()
returns trigger as $$
begin
  if new.status = 'cancelled' and old.status != 'cancelled' then
    delete from public.bundle_reservations
    where bundle_request_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_release_on_cancel
  after update on public.bundle_requests
  for each row execute function public.release_reservations_on_cancel();

-- 7. Auto-reservation trigger on bundle_stock changes
-- ============================================================

create or replace function public.auto_reserve_on_stock_change()
returns trigger as $$
declare
  v_config_id uuid;
  v_total_stock integer;
  v_total_reserved integer;
  v_free_stock integer;
  v_request record;
  v_request_reserved integer;
  v_shortage integer;
  v_to_reserve integer;
begin
  v_config_id := new.bundle_config_id;

  -- Calculate total free stock for this bundle config
  select coalesce(sum(quantity), 0) into v_total_stock
  from public.bundle_stock
  where bundle_config_id = v_config_id;

  select coalesce(sum(res.quantity), 0) into v_total_reserved
  from public.bundle_reservations res
  join public.bundle_requests br on br.id = res.bundle_request_id
  where br.bundle_config_id = v_config_id;

  v_free_stock := v_total_stock - v_total_reserved;

  if v_free_stock <= 0 then
    return new;
  end if;

  -- FIFO: oldest pending requests first
  for v_request in
    select br.id, br.quantity
    from public.bundle_requests br
    where br.bundle_config_id = v_config_id
      and br.status = 'pending'
    order by br.created_at asc
  loop
    if v_free_stock <= 0 then
      exit;
    end if;

    select coalesce(sum(quantity), 0) into v_request_reserved
    from public.bundle_reservations
    where bundle_request_id = v_request.id;

    v_shortage := v_request.quantity - v_request_reserved;

    if v_shortage > 0 then
      v_to_reserve := least(v_free_stock, v_shortage);

      insert into public.bundle_reservations (bundle_request_id, quantity)
      values (v_request.id, v_to_reserve);

      v_free_stock := v_free_stock - v_to_reserve;
    end if;
  end loop;

  return new;
end;
$$ language plpgsql;

create trigger trg_auto_reserve_stock
  after insert or update on public.bundle_stock
  for each row execute function public.auto_reserve_on_stock_change();

-- 8. Views
-- ============================================================

create or replace view public.v_request_overview as
select
  br.id as request_id,
  p.id as project_id,
  p.name as project_name,
  c.id as client_id,
  c.name as client_name,
  bc.id as bundle_config_id,
  bc.name as bundle_name,
  br.quantity as requested,
  coalesce(sum(res.quantity), 0)::integer as reserved,
  (br.quantity - coalesce(sum(res.quantity), 0))::integer as shortage,
  coalesce(bs_free.free_stock, 0)::integer as available_stock,
  br.status,
  br.created_at
from public.bundle_requests br
join public.projects p on p.id = br.project_id
join public.clients c on c.id = p.client_id
join public.bundle_configs bc on bc.id = br.bundle_config_id
left join public.bundle_reservations res on res.bundle_request_id = br.id
left join lateral (
  select coalesce(sum(bs.quantity), 0) - coalesce(
    (select sum(res2.quantity)
     from public.bundle_reservations res2
     join public.bundle_requests br2 on br2.id = res2.bundle_request_id
     where br2.bundle_config_id = bc.id), 0
  ) as free_stock
  from public.bundle_stock bs where bs.bundle_config_id = bc.id
) bs_free on true
group by br.id, p.id, p.name, c.id, c.name, bc.id, bc.name, br.quantity, br.status, br.created_at, bs_free.free_stock;

create or replace view public.v_production_demand as
select
  bc.id as bundle_config_id,
  bc.name as bundle_name,
  c.id as client_id,
  c.name as client_name,
  sum(br.quantity)::integer as total_requested,
  coalesce(total_res.total_reserved, 0)::integer as total_reserved,
  coalesce(bs.total_stock, 0)::integer as total_stock,
  (coalesce(bs.total_stock, 0) - coalesce(total_res.total_reserved, 0))::integer as free_stock,
  greatest(sum(br.quantity) - coalesce(total_res.total_reserved, 0), 0)::integer as total_shortage
from public.bundle_requests br
join public.projects p on p.id = br.project_id
join public.clients c on c.id = p.client_id
join public.bundle_configs bc on bc.id = br.bundle_config_id
left join lateral (
  select coalesce(sum(res.quantity), 0) as total_reserved
  from public.bundle_reservations res
  join public.bundle_requests br2 on br2.id = res.bundle_request_id
  where br2.bundle_config_id = bc.id
) total_res on true
left join lateral (
  select sum(quantity) as total_stock from public.bundle_stock where bundle_config_id = bc.id
) bs on true
where br.status in ('pending', 'ready')
group by bc.id, bc.name, c.id, c.name, bs.total_stock, total_res.total_reserved;

-- 9. Drop is_template from bundle_configs
-- ============================================================

alter table public.bundle_configs drop column if exists is_template;

-- 10. RLS Policies
-- ============================================================

alter table public.projects enable row level security;
alter table public.bundle_requests enable row level security;
alter table public.bundle_reservations enable row level security;

-- Projects: read all, write for sales + admin
create policy "projects_select" on public.projects
  for select to authenticated using (true);

create policy "projects_insert" on public.projects
  for insert to authenticated
  with check (
    (current_setting('request.jwt.claims', true)::json->>'role') in ('sales', 'admin')
  );

create policy "projects_update" on public.projects
  for update to authenticated
  using (
    (current_setting('request.jwt.claims', true)::json->>'role') in ('sales', 'admin')
  );

-- Bundle requests: read all, write for sales + admin
create policy "bundle_requests_select" on public.bundle_requests
  for select to authenticated using (true);

create policy "bundle_requests_insert" on public.bundle_requests
  for insert to authenticated
  with check (
    (current_setting('request.jwt.claims', true)::json->>'role') in ('sales', 'admin')
  );

create policy "bundle_requests_update" on public.bundle_requests
  for update to authenticated
  using (
    (current_setting('request.jwt.claims', true)::json->>'role') in ('sales', 'admin')
  );

-- Bundle reservations: read all, no direct insert (triggers only), delete for admin
create policy "bundle_reservations_select" on public.bundle_reservations
  for select to authenticated using (true);

create policy "bundle_reservations_delete" on public.bundle_reservations
  for delete to authenticated
  using (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'admin'
  );
