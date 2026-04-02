# Karpi Staaltjesbeheer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a sample management system for Karpi BV with product structure, three-level inventory pipeline, location tracking, and role-based dashboards for production, sales, and management.

**Architecture:** Supabase (PostgreSQL + Auth + Realtime) as backend, Next.js 14+ App Router as frontend. Database triggers maintain stock levels automatically across the cut → finish → bundle pipeline. RLS policies enforce role-based access.

**Tech Stack:** Supabase, Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Vercel

**Spec:** `docs/superpowers/specs/2026-03-19-karpi-sample-management-design.md`

---

## File Structure

```
karpi-sample-management/
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── .env.local                          # Supabase URL + anon key
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 001_product_structure.sql    # collections, qualities, color_codes, finishing_types, etc.
│       ├── 002_locations.sql            # locations table
│       ├── 003_inventory_pipeline.sql   # stock tables, batch tables, triggers
│       ├── 004_clients_pricing.sql      # clients, prices, rules (schema only for now)
│       ├── 005_views.sql                # v_pipeline_status, v_bundle_availability, etc.
│       ├── 006_rls_policies.sql         # Row Level Security per role
│       └── 007_seed.sql                 # Test data
├── src/
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts               # Browser Supabase client
│   │   │   ├── server.ts               # Server-side Supabase client
│   │   │   └── types.ts                # Generated DB types
│   │   └── utils.ts                    # Shared helpers
│   ├── app/
│   │   ├── layout.tsx                  # Root layout with auth provider
│   │   ├── page.tsx                    # Redirect to role-based dashboard
│   │   ├── login/
│   │   │   └── page.tsx                # Login page
│   │   ├── production/
│   │   │   ├── layout.tsx              # Production nav
│   │   │   ├── page.tsx                # Production dashboard overview
│   │   │   ├── cut/
│   │   │   │   └── page.tsx            # Register cut batches
│   │   │   ├── finishing/
│   │   │   │   └── page.tsx            # Register finishing batches
│   │   │   ├── bundles/
│   │   │   │   └── page.tsx            # Assemble bundles
│   │   │   └── locations/
│   │   │       └── page.tsx            # Location management
│   │   ├── sales/
│   │   │   ├── layout.tsx              # Sales nav
│   │   │   ├── page.tsx                # Sales dashboard overview
│   │   │   ├── availability/
│   │   │   │   └── page.tsx            # Bundle availability + pipeline view
│   │   │   └── delivery/
│   │   │       └── page.tsx            # Delivery time estimates
│   │   └── management/
│   │       ├── layout.tsx              # Management nav
│   │       └── page.tsx                # KPI overview + stock summary
│   └── components/
│       ├── ui/                         # shadcn/ui components (auto-generated)
│       ├── auth/
│       │   └── auth-provider.tsx       # Auth context + role detection
│       ├── product-selector.tsx        # Collection → Quality → Color cascading select
│       ├── finishing-selector.tsx      # Finishing type select (filtered by quality rules)
│       ├── pipeline-view.tsx           # Visual pipeline: raw → finished → bundles
│       ├── stock-table.tsx             # Reusable stock display table
│       ├── batch-form.tsx              # Reusable batch registration form
│       ├── location-picker.tsx         # Aisle/rack/level selector
│       └── nav-sidebar.tsx             # Role-aware navigation sidebar
└── __tests__/
    ├── lib/
    │   └── utils.test.ts
    └── components/
        ├── product-selector.test.tsx
        ├── pipeline-view.test.tsx
        └── stock-table.test.tsx
```

---

## Task 1: Project Setup & Supabase Connection

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `.env.local`, `.gitignore`
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd "c:/Users/migue/Documents/Karpi BV"
npx create-next-app@latest karpi-sample-management --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

- [ ] **Step 2: Install dependencies**

```bash
cd karpi-sample-management
npm install @supabase/supabase-js @supabase/ssr
npx shadcn@latest init -d
```

- [ ] **Step 3: Create `.env.local`**

Create `karpi-sample-management/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Replace with actual Supabase project credentials.

- [ ] **Step 4: Create browser Supabase client**

Create `src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 5: Create server Supabase client**

Create `src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
}
```

- [ ] **Step 6: Verify dev server starts**

```bash
npm run dev
```

Expected: App runs on http://localhost:3000 without errors.

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Next.js project with Supabase client setup"
```

---

## Task 2: Database Migration — Product Structure

**Files:**
- Create: `supabase/migrations/001_product_structure.sql`

- [ ] **Step 1: Initialize Supabase CLI locally**

```bash
npx supabase init
```

- [ ] **Step 2: Write product structure migration**

Create `supabase/migrations/001_product_structure.sql`:
```sql
-- Collections: top-level grouping (e.g. "Milano", "Venetië")
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Qualities: product lines within a collection
create table public.qualities (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  name text not null,
  material_type text,
  base_price numeric(10,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Color codes per quality
create table public.color_codes (
  id uuid primary key default gen_random_uuid(),
  quality_id uuid not null references public.qualities(id) on delete cascade,
  code text not null,
  name text not null,
  hex_color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(quality_id, code)
);

-- Finishing types (e.g. "Blindzoom", "Overlocking", "Tape")
create table public.finishing_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  production_time_min integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Technical rules: which finishing can be applied to which quality
create table public.quality_finishing_rules (
  id uuid primary key default gen_random_uuid(),
  quality_id uuid not null references public.qualities(id) on delete cascade,
  finishing_type_id uuid not null references public.finishing_types(id) on delete cascade,
  is_allowed boolean not null default true,
  unique(quality_id, finishing_type_id)
);

-- Sample dimensions (e.g. "20x20", "40x60")
create table public.sample_dimensions (
  id uuid primary key default gen_random_uuid(),
  width_cm integer not null,
  height_cm integer not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique(width_cm, height_cm)
);

-- Updated_at trigger function
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.collections
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.qualities
  for each row execute function public.handle_updated_at();
```

- [ ] **Step 3: Apply migration to Supabase**

```bash
npx supabase db push
```

Or apply via Supabase Dashboard SQL editor if using hosted project.

- [ ] **Step 4: Verify tables exist**

Run in Supabase SQL editor:
```sql
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
```

Expected: `collections`, `color_codes`, `finishing_types`, `qualities`, `quality_finishing_rules`, `sample_dimensions`.

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat: add product structure migration (collections, qualities, colors, finishing)"
```

---

## Task 3: Database Migration — Locations

**Files:**
- Create: `supabase/migrations/002_locations.sql`

- [ ] **Step 1: Write locations migration**

Create `supabase/migrations/002_locations.sql`:
```sql
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid,  -- for future multi-warehouse support
  aisle text not null,
  rack text not null,
  level text not null,
  label text generated always as (aisle || '-' || rack || '-' || level) stored,
  created_at timestamptz not null default now(),
  unique(aisle, rack, level)
);
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Verify**

```sql
insert into public.locations (aisle, rack, level) values ('A3', 'R2', 'L1');
select label from public.locations;
```

Expected: `A3-R2-L1`

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add locations migration with auto-generated label"
```

---

## Task 4: Database Migration — Inventory Pipeline (Stock + Batches + Triggers)

**Files:**
- Create: `supabase/migrations/003_inventory_pipeline.sql`

- [ ] **Step 1: Write inventory pipeline migration**

Create `supabase/migrations/003_inventory_pipeline.sql`:
```sql
-- ============================================================
-- RAW STOCK (cut, not yet finished)
-- ============================================================
create table public.raw_stock (
  quality_id uuid not null references public.qualities(id),
  color_code_id uuid not null references public.color_codes(id),
  dimension_id uuid not null references public.sample_dimensions(id),
  location_id uuid not null references public.locations(id),
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (quality_id, color_code_id, dimension_id, location_id)
);

-- ============================================================
-- CUT BATCHES (audit trail for cutting)
-- ============================================================
create table public.cut_batches (
  id uuid primary key default gen_random_uuid(),
  quality_id uuid not null references public.qualities(id),
  color_code_id uuid not null references public.color_codes(id),
  dimension_id uuid not null references public.sample_dimensions(id),
  location_id uuid not null references public.locations(id),
  quantity integer not null check (quantity > 0),
  cut_date timestamptz not null default now(),
  cut_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Trigger: cut_batch → increase raw_stock
create or replace function public.on_cut_batch_insert()
returns trigger as $$
begin
  insert into public.raw_stock (quality_id, color_code_id, dimension_id, location_id, quantity)
  values (new.quality_id, new.color_code_id, new.dimension_id, new.location_id, new.quantity)
  on conflict (quality_id, color_code_id, dimension_id, location_id)
  do update set
    quantity = raw_stock.quantity + new.quantity,
    updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_cut_batch_insert after insert on public.cut_batches
  for each row execute function public.on_cut_batch_insert();

-- ============================================================
-- FINISHED STOCK (finished, ready for bundling)
-- ============================================================
create table public.finished_stock (
  quality_id uuid not null references public.qualities(id),
  color_code_id uuid not null references public.color_codes(id),
  dimension_id uuid not null references public.sample_dimensions(id),
  finishing_type_id uuid not null references public.finishing_types(id),
  location_id uuid not null references public.locations(id),
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (quality_id, color_code_id, dimension_id, finishing_type_id, location_id)
);

-- ============================================================
-- FINISHING BATCHES (audit trail for finishing)
-- ============================================================
create table public.finishing_batches (
  id uuid primary key default gen_random_uuid(),
  quality_id uuid not null references public.qualities(id),
  color_code_id uuid not null references public.color_codes(id),
  dimension_id uuid not null references public.sample_dimensions(id),
  finishing_type_id uuid not null references public.finishing_types(id),
  source_location_id uuid not null references public.locations(id),
  target_location_id uuid not null references public.locations(id),
  quantity integer not null check (quantity > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  finished_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Trigger: finishing_batch → decrease raw_stock, increase finished_stock
create or replace function public.on_finishing_batch_insert()
returns trigger as $$
begin
  -- Decrease raw stock
  update public.raw_stock
  set quantity = quantity - new.quantity,
      updated_at = now()
  where quality_id = new.quality_id
    and color_code_id = new.color_code_id
    and dimension_id = new.dimension_id
    and location_id = new.source_location_id;

  -- Check we didn't go negative (constraint will catch, but explicit error is clearer)
  if not found then
    raise exception 'Insufficient raw stock for finishing batch';
  end if;

  -- Increase finished stock
  insert into public.finished_stock
    (quality_id, color_code_id, dimension_id, finishing_type_id, location_id, quantity)
  values
    (new.quality_id, new.color_code_id, new.dimension_id, new.finishing_type_id, new.target_location_id, new.quantity)
  on conflict (quality_id, color_code_id, dimension_id, finishing_type_id, location_id)
  do update set
    quantity = finished_stock.quantity + new.quantity,
    updated_at = now();

  return new;
end;
$$ language plpgsql;

create trigger trg_finishing_batch_insert after insert on public.finishing_batches
  for each row execute function public.on_finishing_batch_insert();

-- ============================================================
-- BUNDLE CONFIGS (templates for bundle composition)
-- ============================================================
create table public.bundle_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid,  -- FK added in clients migration; NULL = standard bundle
  is_template boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bundle_config_items (
  id uuid primary key default gen_random_uuid(),
  bundle_config_id uuid not null references public.bundle_configs(id) on delete cascade,
  quality_id uuid not null references public.qualities(id),
  color_code_id uuid references public.color_codes(id),  -- NULL = all colors of this quality
  finishing_type_id uuid not null references public.finishing_types(id),
  dimension_id uuid not null references public.sample_dimensions(id),
  quantity integer not null check (quantity > 0)
);

-- ============================================================
-- BUNDLE STOCK
-- ============================================================
create table public.bundle_stock (
  bundle_config_id uuid not null references public.bundle_configs(id),
  location_id uuid not null references public.locations(id),
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (bundle_config_id, location_id)
);

-- ============================================================
-- BUNDLE BATCHES (audit trail for bundle assembly)
-- ============================================================
create table public.bundle_batches (
  id uuid primary key default gen_random_uuid(),
  bundle_config_id uuid not null references public.bundle_configs(id),
  location_id uuid not null references public.locations(id),
  quantity integer not null check (quantity > 0),
  assembled_at timestamptz not null default now(),
  assembled_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Trigger: bundle_batch → decrease finished_stock per config item, increase bundle_stock
create or replace function public.on_bundle_batch_insert()
returns trigger as $$
declare
  item record;
begin
  -- For each item in the bundle config, decrease finished_stock
  for item in
    select * from public.bundle_config_items
    where bundle_config_id = new.bundle_config_id
  loop
    update public.finished_stock
    set quantity = quantity - (item.quantity * new.quantity),
        updated_at = now()
    where quality_id = item.quality_id
      and color_code_id = item.color_code_id
      and dimension_id = item.dimension_id
      and finishing_type_id = item.finishing_type_id
      and location_id = new.location_id;

    if not found then
      raise exception 'Insufficient finished stock for bundle item: quality_id=%, color_code_id=%, finishing_type_id=%',
        item.quality_id, item.color_code_id, item.finishing_type_id;
    end if;
  end loop;

  -- Increase bundle stock
  insert into public.bundle_stock (bundle_config_id, location_id, quantity)
  values (new.bundle_config_id, new.location_id, new.quantity)
  on conflict (bundle_config_id, location_id)
  do update set
    quantity = bundle_stock.quantity + new.quantity,
    updated_at = now();

  return new;
end;
$$ language plpgsql;

create trigger trg_bundle_batch_insert after insert on public.bundle_batches
  for each row execute function public.on_bundle_batch_insert();

-- Updated_at triggers
create trigger set_updated_at before update on public.bundle_configs
  for each row execute function public.handle_updated_at();
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Verify trigger chain works**

Run in Supabase SQL editor (use a test user ID from auth.users):
```sql
-- This is a manual verification script; adjust UUIDs after seeding in Task 6
-- The trigger chain: cut → raw_stock up, finish → raw_stock down + finished_stock up
```

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add inventory pipeline migration (stock tables, batches, triggers)"
```

---

## Task 5: Database Migration — Clients, Pricing & Views

**Files:**
- Create: `supabase/migrations/004_clients_pricing.sql`
- Create: `supabase/migrations/005_views.sql`

- [ ] **Step 1: Write clients & pricing migration**

Create `supabase/migrations/004_clients_pricing.sql`:
```sql
-- Clients with self-referencing hierarchy (parent org → branches)
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  parent_client_id uuid references public.clients(id),
  name text not null,
  client_type text not null check (client_type in ('wholesaler', 'retailer', 'consumer')),
  contact_email text,
  logo_url text,
  sticker_text text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add FK from bundle_configs to clients
alter table public.bundle_configs
  add constraint fk_bundle_configs_client
  foreign key (client_id) references public.clients(id);

-- Purchase prices (what client pays Karpi)
create table public.client_purchase_prices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  quality_id uuid not null references public.qualities(id),
  finishing_type_id uuid references public.finishing_types(id),
  price numeric(10,2) not null,
  valid_from date not null default current_date,
  valid_until date,
  created_at timestamptz not null default now()
);

-- Retail prices (what client charges consumers — for sticker)
create table public.client_retail_prices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  quality_id uuid not null references public.qualities(id),
  dimension_id uuid not null references public.sample_dimensions(id),
  price numeric(10,2) not null,
  price_per text not null check (price_per in ('piece', 'm2')) default 'piece',
  created_at timestamptz not null default now()
);

-- Commercial rules (allow/deny per client)
create table public.client_product_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  quality_id uuid not null references public.qualities(id),
  finishing_type_id uuid references public.finishing_types(id),
  rule_type text not null check (rule_type in ('allow', 'deny'))
);

create trigger set_updated_at before update on public.clients
  for each row execute function public.handle_updated_at();
```

- [ ] **Step 2: Write views migration**

Create `supabase/migrations/005_views.sql`:
```sql
-- Pipeline status: per quality+color+dimension, stock at each level
create or replace view public.v_pipeline_status as
select
  q.id as quality_id,
  q.name as quality_name,
  c.id as collection_id,
  c.name as collection_name,
  cc.id as color_code_id,
  cc.code as color_code,
  cc.name as color_name,
  sd.id as dimension_id,
  sd.name as dimension_name,
  coalesce(rs.raw_total, 0) as raw_stock_total,
  coalesce(fs.finished_total, 0) as finished_stock_total,
  coalesce(bss.bundle_total, 0) as bundle_stock_total
from public.qualities q
join public.collections c on c.id = q.collection_id
cross join public.sample_dimensions sd
left join public.color_codes cc on cc.quality_id = q.id
left join lateral (
  select sum(quantity) as raw_total
  from public.raw_stock r
  where r.quality_id = q.id
    and r.color_code_id = cc.id
    and r.dimension_id = sd.id
) rs on true
left join lateral (
  select sum(quantity) as finished_total
  from public.finished_stock f
  where f.quality_id = q.id
    and f.color_code_id = cc.id
    and f.dimension_id = sd.id
) fs on true
left join lateral (
  select sum(bs.quantity) as bundle_total
  from public.bundle_stock bs
  join public.bundle_config_items bci on bci.bundle_config_id = bs.bundle_config_id
  where bci.quality_id = q.id
    and (bci.color_code_id is null or bci.color_code_id = cc.id)
    and bci.dimension_id = sd.id
) bss on true
where q.active = true;

-- Bundle availability: per bundle config, how many ready + how many can be made
create or replace view public.v_bundle_availability as
select
  bc.id as bundle_config_id,
  bc.name as bundle_name,
  bc.client_id,
  coalesce(bs.total_bundles, 0) as bundles_ready,
  -- Minimum bundles that could be assembled from finished stock
  (
    select coalesce(min(
      floor(coalesce(fs_sum.total, 0)::numeric / bci.quantity)
    ), 0)
    from public.bundle_config_items bci
    left join lateral (
      select sum(f.quantity) as total
      from public.finished_stock f
      where f.quality_id = bci.quality_id
        and (bci.color_code_id is null or f.color_code_id = bci.color_code_id)
        and f.dimension_id = bci.dimension_id
        and f.finishing_type_id = bci.finishing_type_id
    ) fs_sum on true
    where bci.bundle_config_id = bc.id
  )::integer as bundles_makeable
from public.bundle_configs bc
left join lateral (
  select sum(quantity) as total_bundles
  from public.bundle_stock b
  where b.bundle_config_id = bc.id
) bs on true
where bc.active = true;

-- Restock needed: items where finished stock is below a threshold
-- Threshold can be configured later; using 10 as placeholder
create or replace view public.v_restock_needed as
select
  q.name as quality_name,
  cc.code as color_code,
  cc.name as color_name,
  ft.name as finishing_name,
  sd.name as dimension_name,
  l.label as location_label,
  coalesce(f.quantity, 0) as current_stock,
  coalesce(rs.raw_available, 0) as raw_available
from public.finished_stock f
join public.qualities q on q.id = f.quality_id
join public.color_codes cc on cc.id = f.color_code_id
join public.sample_dimensions sd on sd.id = f.dimension_id
join public.finishing_types ft on ft.id = f.finishing_type_id
join public.locations l on l.id = f.location_id
left join lateral (
  select sum(r.quantity) as raw_available
  from public.raw_stock r
  where r.quality_id = f.quality_id
    and r.color_code_id = f.color_code_id
    and r.dimension_id = f.dimension_id
) rs on true
where f.quantity < 10;

-- Client catalog: per client, which products are available (technical + commercial rules)
create or replace view public.v_client_catalog as
select
  cl.id as client_id,
  cl.name as client_name,
  q.id as quality_id,
  q.name as quality_name,
  c.name as collection_name,
  ft.id as finishing_type_id,
  ft.name as finishing_name,
  qfr.is_allowed as technically_allowed,
  case
    -- If client has any "allow" rules, only explicitly allowed combos are permitted
    when exists (
      select 1 from public.client_product_rules cpr2
      where cpr2.client_id = cl.id and cpr2.rule_type = 'allow'
    ) then exists (
      select 1 from public.client_product_rules cpr3
      where cpr3.client_id = cl.id
        and cpr3.quality_id = q.id
        and (cpr3.finishing_type_id is null or cpr3.finishing_type_id = ft.id)
        and cpr3.rule_type = 'allow'
    )
    -- Otherwise, check there's no deny rule
    else not exists (
      select 1 from public.client_product_rules cpr4
      where cpr4.client_id = cl.id
        and cpr4.quality_id = q.id
        and (cpr4.finishing_type_id is null or cpr4.finishing_type_id = ft.id)
        and cpr4.rule_type = 'deny'
    )
  end as commercially_allowed
from public.clients cl
cross join public.qualities q
join public.collections c on c.id = q.collection_id
cross join public.finishing_types ft
left join public.quality_finishing_rules qfr
  on qfr.quality_id = q.id and qfr.finishing_type_id = ft.id
where cl.active = true
  and q.active = true
  and ft.active = true
  and coalesce(qfr.is_allowed, false) = true;
```

- [ ] **Step 3: Apply migrations**

```bash
npx supabase db push
```

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add clients/pricing schema and pipeline views"
```

---

## Task 6: Database Migration — RLS Policies & Seed Data

**Files:**
- Create: `supabase/migrations/006_rls_policies.sql`
- Create: `supabase/migrations/007_seed.sql`

- [ ] **Step 1: Write RLS policies**

Create `supabase/migrations/006_rls_policies.sql`:
```sql
-- Enable RLS on all tables
alter table public.collections enable row level security;
alter table public.qualities enable row level security;
alter table public.color_codes enable row level security;
alter table public.finishing_types enable row level security;
alter table public.quality_finishing_rules enable row level security;
alter table public.sample_dimensions enable row level security;
alter table public.locations enable row level security;
alter table public.raw_stock enable row level security;
alter table public.cut_batches enable row level security;
alter table public.finished_stock enable row level security;
alter table public.finishing_batches enable row level security;
alter table public.bundle_configs enable row level security;
alter table public.bundle_config_items enable row level security;
alter table public.bundle_stock enable row level security;
alter table public.bundle_batches enable row level security;
alter table public.clients enable row level security;
alter table public.client_purchase_prices enable row level security;
alter table public.client_retail_prices enable row level security;
alter table public.client_product_rules enable row level security;

-- Helper: get user role from metadata
create or replace function public.get_user_role()
returns text as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    'sales'  -- default role
  );
$$ language sql stable;

-- Read policies: all authenticated users can read product structure + stock
create policy "Authenticated users can read collections"
  on public.collections for select to authenticated using (true);
create policy "Authenticated users can read qualities"
  on public.qualities for select to authenticated using (true);
create policy "Authenticated users can read color_codes"
  on public.color_codes for select to authenticated using (true);
create policy "Authenticated users can read finishing_types"
  on public.finishing_types for select to authenticated using (true);
create policy "Authenticated users can read quality_finishing_rules"
  on public.quality_finishing_rules for select to authenticated using (true);
create policy "Authenticated users can read sample_dimensions"
  on public.sample_dimensions for select to authenticated using (true);
create policy "Authenticated users can read locations"
  on public.locations for select to authenticated using (true);
create policy "Authenticated users can read raw_stock"
  on public.raw_stock for select to authenticated using (true);
create policy "Authenticated users can read finished_stock"
  on public.finished_stock for select to authenticated using (true);
create policy "Authenticated users can read bundle_stock"
  on public.bundle_stock for select to authenticated using (true);
create policy "Authenticated users can read bundle_configs"
  on public.bundle_configs for select to authenticated using (true);
create policy "Authenticated users can read bundle_config_items"
  on public.bundle_config_items for select to authenticated using (true);
create policy "Authenticated users can read clients"
  on public.clients for select to authenticated using (true);
create policy "Authenticated users can read cut_batches"
  on public.cut_batches for select to authenticated using (true);
create policy "Authenticated users can read finishing_batches"
  on public.finishing_batches for select to authenticated using (true);
create policy "Authenticated users can read bundle_batches"
  on public.bundle_batches for select to authenticated using (true);
create policy "Authenticated users can read client_purchase_prices"
  on public.client_purchase_prices for select to authenticated using (true);
create policy "Authenticated users can read client_retail_prices"
  on public.client_retail_prices for select to authenticated using (true);
create policy "Authenticated users can read client_product_rules"
  on public.client_product_rules for select to authenticated using (true);

-- Write policies: production + admin can write batches
create policy "Production can insert cut_batches"
  on public.cut_batches for insert to authenticated
  with check (public.get_user_role() in ('production', 'admin'));
create policy "Production can insert finishing_batches"
  on public.finishing_batches for insert to authenticated
  with check (public.get_user_role() in ('production', 'admin'));
create policy "Production can insert bundle_batches"
  on public.bundle_batches for insert to authenticated
  with check (public.get_user_role() in ('production', 'admin'));

-- Admin can manage product structure, locations, clients, configs
create policy "Admin can manage collections"
  on public.collections for all to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');
create policy "Admin can manage qualities"
  on public.qualities for all to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');
create policy "Admin can manage color_codes"
  on public.color_codes for all to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');
create policy "Admin can manage finishing_types"
  on public.finishing_types for all to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');
create policy "Admin can manage quality_finishing_rules"
  on public.quality_finishing_rules for all to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');
create policy "Admin can manage sample_dimensions"
  on public.sample_dimensions for all to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');
create policy "Admin/Production can manage locations"
  on public.locations for all to authenticated
  using (public.get_user_role() in ('production', 'admin'))
  with check (public.get_user_role() in ('production', 'admin'));
create policy "Admin can manage bundle_configs"
  on public.bundle_configs for all to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');
create policy "Admin can manage bundle_config_items"
  on public.bundle_config_items for all to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');
create policy "Admin can manage clients"
  on public.clients for all to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');
create policy "Admin can manage client_purchase_prices"
  on public.client_purchase_prices for all to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');
create policy "Admin can manage client_retail_prices"
  on public.client_retail_prices for all to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');
create policy "Admin can manage client_product_rules"
  on public.client_product_rules for all to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');
```

- [ ] **Step 2: Write seed data**

Create `supabase/migrations/007_seed.sql`:
```sql
-- Seed: sample product structure for development/testing

-- Collections
insert into public.collections (id, name, description) values
  ('a0000000-0000-0000-0000-000000000001', 'Milano', 'Milano collectie — premium tapijten'),
  ('a0000000-0000-0000-0000-000000000002', 'Venetië', 'Venetië collectie — klassiek design');

-- Qualities
insert into public.qualities (id, collection_id, name, material_type, base_price) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Milano Velour', 'velour', 25.00),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Milano Bouclé', 'bouclé', 30.00),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Venetië Saxony', 'saxony', 35.00);

-- Color codes (5 per quality for dev)
insert into public.color_codes (quality_id, code, name, hex_color) values
  ('b0000000-0000-0000-0000-000000000001', '001', 'Ivoor', '#FFFFF0'),
  ('b0000000-0000-0000-0000-000000000001', '002', 'Antraciet', '#293133'),
  ('b0000000-0000-0000-0000-000000000001', '003', 'Taupe', '#483C32'),
  ('b0000000-0000-0000-0000-000000000001', '004', 'Zandbeige', '#C2B280'),
  ('b0000000-0000-0000-0000-000000000001', '005', 'Bordeaux', '#800020'),
  ('b0000000-0000-0000-0000-000000000002', '001', 'Ivoor', '#FFFFF0'),
  ('b0000000-0000-0000-0000-000000000002', '002', 'Grijs', '#808080'),
  ('b0000000-0000-0000-0000-000000000002', '003', 'Navy', '#000080'),
  ('b0000000-0000-0000-0000-000000000003', '001', 'Crème', '#FFFDD0'),
  ('b0000000-0000-0000-0000-000000000003', '002', 'Mosgroen', '#4A5D23');

-- Finishing types
insert into public.finishing_types (id, name, description, production_time_min) values
  ('c0000000-0000-0000-0000-000000000001', 'Blindzoom', 'Onzichtbare zoom', 5),
  ('c0000000-0000-0000-0000-000000000002', 'Overlocking', 'Geoverlocked rand', 3),
  ('c0000000-0000-0000-0000-000000000003', 'Tape', 'Tape-afwerking', 4);

-- Quality-finishing rules (Milano Velour: all, Milano Bouclé: no Tape, Venetië: only Blindzoom)
insert into public.quality_finishing_rules (quality_id, finishing_type_id, is_allowed) values
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', true),
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', true),
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', true),
  ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', true),
  ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', true),
  ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', false),
  ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', true),
  ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', false),
  ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', false);

-- Sample dimensions
insert into public.sample_dimensions (id, width_cm, height_cm, name) values
  ('d0000000-0000-0000-0000-000000000001', 20, 20, 'Klein (20x20)'),
  ('d0000000-0000-0000-0000-000000000002', 40, 60, 'Groot (40x60)');

-- Locations
insert into public.locations (id, aisle, rack, level) values
  ('e0000000-0000-0000-0000-000000000001', 'A', '1', '1'),
  ('e0000000-0000-0000-0000-000000000002', 'A', '1', '2'),
  ('e0000000-0000-0000-0000-000000000003', 'A', '2', '1'),
  ('e0000000-0000-0000-0000-000000000004', 'B', '1', '1');

-- Sample client
insert into public.clients (id, name, client_type, contact_email) values
  ('f0000000-0000-0000-0000-000000000001', 'Interieur Groep NL', 'wholesaler', 'info@interieurgroep.nl'),
  ('f0000000-0000-0000-0000-000000000002', 'Tapijt Boutique Delft', 'retailer', 'info@tapijtboutique.nl');
```

- [ ] **Step 3: Apply migrations**

```bash
npx supabase db push
```

- [ ] **Step 4: Verify seed data and views work**

```sql
select * from public.v_pipeline_status limit 5;
select * from public.v_bundle_availability;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat: add RLS policies and seed data for development"
```

---

## Task 7: Generate TypeScript Types & Auth Provider

**Files:**
- Create: `src/lib/supabase/types.ts`
- Create: `src/components/auth/auth-provider.tsx`

- [ ] **Step 1: Generate TypeScript types from Supabase**

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/types.ts
```

Replace `YOUR_PROJECT_ID` with actual project ID.

- [ ] **Step 2: Update Supabase clients to use types**

Update `src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Update `src/lib/supabase/server.ts` similarly — add `<Database>` generic to `createServerClient`.

- [ ] **Step 3: Create auth provider**

Create `src/components/auth/auth-provider.tsx`:
```typescript
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type UserRole = "production" | "sales" | "admin";

interface AuthContext {
  user: User | null;
  role: UserRole;
  loading: boolean;
}

const AuthContext = createContext<AuthContext>({
  user: null,
  role: "sales",
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>("sales");
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        setRole(
          (currentUser?.app_metadata?.role as UserRole) ?? "sales"
        );
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 4: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat: add generated DB types and auth provider with role detection"
```

---

## Task 8: Login Page & Root Layout

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/app/login/page.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Install shadcn components needed**

```bash
npx shadcn@latest add button input card label
```

- [ ] **Step 2: Update root layout with auth provider**

Modify `src/app/layout.tsx`:
```typescript
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Karpi Staaltjesbeheer",
  description: "Intern systeem voor staaltjesbeheer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create login page**

Create `src/app/login/page.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl">
            Karpi Staaltjesbeheer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Wachtwoord</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Inloggen..." : "Inloggen"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Create root page with role-based redirect**

Modify `src/app/page.tsx`:
```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

export default function Home() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    switch (role) {
      case "production":
        router.push("/production");
        break;
      case "admin":
        router.push("/management");
        break;
      default:
        router.push("/sales");
    }
  }, [user, role, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-gray-500">Laden...</p>
    </div>
  );
}
```

- [ ] **Step 5: Verify login page renders**

```bash
npm run dev
```

Navigate to http://localhost:3000/login — should show login form.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: add login page and role-based redirect"
```

---

## Task 9: Navigation Sidebar & Dashboard Layouts

**Files:**
- Create: `src/components/nav-sidebar.tsx`
- Create: `src/app/production/layout.tsx`, `src/app/production/page.tsx`
- Create: `src/app/sales/layout.tsx`, `src/app/sales/page.tsx`
- Create: `src/app/management/layout.tsx`, `src/app/management/page.tsx`

- [ ] **Step 1: Install additional shadcn components**

```bash
npx shadcn@latest add separator badge
```

- [ ] **Step 2: Create navigation sidebar**

Create `src/components/nav-sidebar.tsx`:
```typescript
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  label: string;
  href: string;
}

const navItems: Record<string, NavItem[]> = {
  production: [
    { label: "Overzicht", href: "/production" },
    { label: "Snijden", href: "/production/cut" },
    { label: "Afwerken", href: "/production/finishing" },
    { label: "Bundelen", href: "/production/bundles" },
    { label: "Locaties", href: "/production/locations" },
  ],
  sales: [
    { label: "Overzicht", href: "/sales" },
    { label: "Beschikbaarheid", href: "/sales/availability" },
    { label: "Levertijden", href: "/sales/delivery" },
  ],
  admin: [
    { label: "Overzicht", href: "/management" },
  ],
};

const roleLabels: Record<string, string> = {
  production: "Productie",
  sales: "Verkoop",
  admin: "Management",
};

export function NavSidebar() {
  const { user, role } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const items = navItems[role] ?? navItems.sales;

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-white px-4 py-6">
      <div className="mb-6">
        <h1 className="text-lg font-bold">Karpi</h1>
        <p className="text-sm text-gray-500">Staaltjesbeheer</p>
      </div>
      <Badge variant="secondary" className="mb-4 w-fit">
        {roleLabels[role] ?? role}
      </Badge>
      <Separator className="mb-4" />
      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${
              pathname === item.href
                ? "bg-gray-100 font-medium text-gray-900"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <Separator className="my-4" />
      <div className="text-xs text-gray-400 mb-2">{user?.email}</div>
      <Button variant="outline" size="sm" onClick={handleLogout}>
        Uitloggen
      </Button>
    </aside>
  );
}
```

- [ ] **Step 3: Create production layout & placeholder page**

Create `src/app/production/layout.tsx`:
```typescript
import { NavSidebar } from "@/components/nav-sidebar";

export default function ProductionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
```

Create `src/app/production/page.tsx`:
```typescript
export default function ProductionDashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Productie Overzicht</h2>
      <p className="text-gray-500">Dashboard wordt hier opgebouwd.</p>
    </div>
  );
}
```

- [ ] **Step 4: Create sales layout & placeholder page**

Create `src/app/sales/layout.tsx` (same pattern as production, with `NavSidebar`).

Create `src/app/sales/page.tsx`:
```typescript
export default function SalesDashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Verkoop Overzicht</h2>
      <p className="text-gray-500">Dashboard wordt hier opgebouwd.</p>
    </div>
  );
}
```

- [ ] **Step 5: Create management layout & placeholder page**

Create `src/app/management/layout.tsx` (same pattern).

Create `src/app/management/page.tsx`:
```typescript
export default function ManagementDashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Management Overzicht</h2>
      <p className="text-gray-500">Dashboard wordt hier opgebouwd.</p>
    </div>
  );
}
```

- [ ] **Step 6: Verify navigation works**

```bash
npm run dev
```

Navigate to `/production`, `/sales`, `/management` — each should show sidebar + placeholder.

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "feat: add navigation sidebar and role-based dashboard layouts"
```

---

## Task 10: Product Selector Component

**Files:**
- Create: `src/components/product-selector.tsx`
- Create: `src/components/finishing-selector.tsx`
- Create: `__tests__/components/product-selector.test.tsx`

- [ ] **Step 1: Install shadcn select component**

```bash
npx shadcn@latest add select
```

- [ ] **Step 2: Write failing test for product selector**

Create `__tests__/components/product-selector.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import { ProductSelector } from "@/components/product-selector";

// Mock Supabase client
jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          data: table === "collections"
            ? [{ id: "1", name: "Milano" }]
            : table === "qualities"
            ? [{ id: "q1", name: "Milano Velour", collection_id: "1" }]
            : [{ id: "cc1", code: "001", name: "Ivoor", quality_id: "q1" }],
          error: null,
        }),
        eq: () => ({
          order: () => ({
            data: [],
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

describe("ProductSelector", () => {
  it("renders collection select", () => {
    render(<ProductSelector onSelect={jest.fn()} />);
    expect(screen.getByText("Collectie")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- __tests__/components/product-selector.test.tsx
```

Expected: FAIL — `ProductSelector` not found.

- [ ] **Step 4: Create product selector component**

Create `src/components/product-selector.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProductSelection {
  collectionId: string;
  qualityId: string;
  colorCodeId: string;
}

interface ProductSelectorProps {
  onSelect: (selection: ProductSelection) => void;
}

interface Collection {
  id: string;
  name: string;
}

interface Quality {
  id: string;
  name: string;
  collection_id: string;
}

interface ColorCode {
  id: string;
  code: string;
  name: string;
  quality_id: string;
}

export function ProductSelector({ onSelect }: ProductSelectorProps) {
  const supabase = createClient();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [colorCodes, setColorCodes] = useState<ColorCode[]>([]);
  const [selectedCollection, setSelectedCollection] = useState("");
  const [selectedQuality, setSelectedQuality] = useState("");
  const [selectedColorCode, setSelectedColorCode] = useState("");

  useEffect(() => {
    supabase
      .from("collections")
      .select("id, name")
      .order("name")
      .then(({ data }) => setCollections(data ?? []));
  }, [supabase]);

  useEffect(() => {
    if (!selectedCollection) {
      setQualities([]);
      return;
    }
    supabase
      .from("qualities")
      .select("id, name, collection_id")
      .eq("collection_id", selectedCollection)
      .order("name")
      .then(({ data }) => setQualities(data ?? []));
    setSelectedQuality("");
    setSelectedColorCode("");
  }, [selectedCollection, supabase]);

  useEffect(() => {
    if (!selectedQuality) {
      setColorCodes([]);
      return;
    }
    supabase
      .from("color_codes")
      .select("id, code, name, quality_id")
      .eq("quality_id", selectedQuality)
      .order("code")
      .then(({ data }) => setColorCodes(data ?? []));
    setSelectedColorCode("");
  }, [selectedQuality, supabase]);

  useEffect(() => {
    if (selectedCollection && selectedQuality && selectedColorCode) {
      onSelect({
        collectionId: selectedCollection,
        qualityId: selectedQuality,
        colorCodeId: selectedColorCode,
      });
    }
  }, [selectedCollection, selectedQuality, selectedColorCode, onSelect]);

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label>Collectie</Label>
        <Select value={selectedCollection} onValueChange={setSelectedCollection}>
          <SelectTrigger>
            <SelectValue placeholder="Selecteer collectie" />
          </SelectTrigger>
          <SelectContent>
            {collections.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Kwaliteit</Label>
        <Select
          value={selectedQuality}
          onValueChange={setSelectedQuality}
          disabled={!selectedCollection}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecteer kwaliteit" />
          </SelectTrigger>
          <SelectContent>
            {qualities.map((q) => (
              <SelectItem key={q.id} value={q.id}>
                {q.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Kleurcode</Label>
        <Select
          value={selectedColorCode}
          onValueChange={setSelectedColorCode}
          disabled={!selectedQuality}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecteer kleur" />
          </SelectTrigger>
          <SelectContent>
            {colorCodes.map((cc) => (
              <SelectItem key={cc.id} value={cc.id}>
                {cc.code} — {cc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create finishing selector**

Create `src/components/finishing-selector.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FinishingSelectorProps {
  qualityId: string;
  onSelect: (finishingTypeId: string) => void;
}

interface FinishingType {
  id: string;
  name: string;
}

export function FinishingSelector({
  qualityId,
  onSelect,
}: FinishingSelectorProps) {
  const supabase = createClient();
  const [finishingTypes, setFinishingTypes] = useState<FinishingType[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (!qualityId) {
      setFinishingTypes([]);
      return;
    }
    // Only show finishing types allowed for this quality
    supabase
      .from("quality_finishing_rules")
      .select("finishing_type_id, finishing_types(id, name)")
      .eq("quality_id", qualityId)
      .eq("is_allowed", true)
      .then(({ data }) => {
        const types = (data ?? [])
          .map((r: any) => r.finishing_types)
          .filter(Boolean);
        setFinishingTypes(types);
      });
    setSelected("");
  }, [qualityId, supabase]);

  function handleChange(value: string) {
    setSelected(value);
    onSelect(value);
  }

  return (
    <div className="space-y-2">
      <Label>Afwerking</Label>
      <Select
        value={selected}
        onValueChange={handleChange}
        disabled={!qualityId}
      >
        <SelectTrigger>
          <SelectValue placeholder="Selecteer afwerking" />
        </SelectTrigger>
        <SelectContent>
          {finishingTypes.map((ft) => (
            <SelectItem key={ft.id} value={ft.id}>
              {ft.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 6: Run test**

```bash
npm test -- __tests__/components/product-selector.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ __tests__/
git commit -m "feat: add product selector and finishing selector components"
```

---

## Task 11: Production — Cut Batch Page

**Files:**
- Create: `src/components/batch-form.tsx`
- Create: `src/components/location-picker.tsx`
- Create: `src/app/production/cut/page.tsx`

- [ ] **Step 1: Create location picker**

Create `src/components/location-picker.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LocationPickerProps {
  onSelect: (locationId: string) => void;
}

interface Location {
  id: string;
  label: string;
}

export function LocationPicker({ onSelect }: LocationPickerProps) {
  const supabase = createClient();
  const [locations, setLocations] = useState<Location[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    supabase
      .from("locations")
      .select("id, label")
      .order("label")
      .then(({ data }) => setLocations(data ?? []));
  }, [supabase]);

  function handleChange(value: string) {
    setSelected(value);
    onSelect(value);
  }

  return (
    <div className="space-y-2">
      <Label>Locatie</Label>
      <Select value={selected} onValueChange={handleChange}>
        <SelectTrigger>
          <SelectValue placeholder="Selecteer locatie" />
        </SelectTrigger>
        <SelectContent>
          {locations.map((loc) => (
            <SelectItem key={loc.id} value={loc.id}>
              {loc.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 2: Create cut batch page**

Create `src/app/production/cut/page.tsx`:
```typescript
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ProductSelector } from "@/components/product-selector";
import { LocationPicker } from "@/components/location-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/auth/auth-provider";

export default function CutBatchPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [product, setProduct] = useState({
    collectionId: "",
    qualityId: "",
    colorCodeId: "",
  });
  const [dimensionId, setDimensionId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [dimensions, setDimensions] = useState<
    { id: string; name: string }[]
  >([]);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");

  // Load dimensions on mount
  useEffect(() => {
    supabase
      .from("sample_dimensions")
      .select("id, name")
      .order("name")
      .then(({ data }) => setDimensions(data ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setStatus("saving");
    setErrorMsg("");

    const { error } = await supabase.from("cut_batches").insert({
      quality_id: product.qualityId,
      color_code_id: product.colorCodeId,
      dimension_id: dimensionId,
      location_id: locationId,
      quantity: parseInt(quantity, 10),
      cut_by: user.id,
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("success");
      setQuantity("");
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Snij-batch registreren</h2>

      <Card>
        <CardHeader>
          <CardTitle>Nieuwe snij-batch</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <ProductSelector onSelect={setProduct} />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Maat</Label>
                <Select value={dimensionId} onValueChange={setDimensionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer maat" />
                  </SelectTrigger>
                  <SelectContent>
                    {dimensions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Aantal</Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Aantal staaltjes"
                  required
                />
              </div>
            </div>

            <LocationPicker onSelect={setLocationId} />

            {status === "error" && (
              <p className="text-sm text-red-600">{errorMsg}</p>
            )}
            {status === "success" && (
              <p className="text-sm text-green-600">
                Snij-batch succesvol geregistreerd!
              </p>
            )}

            <Button
              type="submit"
              disabled={
                status === "saving" ||
                !product.qualityId ||
                !product.colorCodeId ||
                !dimensionId ||
                !locationId ||
                !quantity
              }
            >
              {status === "saving" ? "Opslaan..." : "Registreren"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Verify page renders**

```bash
npm run dev
```

Navigate to `/production/cut` — should show the form.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: add cut batch registration page with product/location selectors"
```

---

## Task 12: Production — Finishing Batch Page

**Files:**
- Create: `src/app/production/finishing/page.tsx`

- [ ] **Step 1: Create finishing batch page**

Create `src/app/production/finishing/page.tsx`:
```typescript
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ProductSelector } from "@/components/product-selector";
import { FinishingSelector } from "@/components/finishing-selector";
import { LocationPicker } from "@/components/location-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/auth/auth-provider";

export default function FinishingBatchPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [product, setProduct] = useState({
    collectionId: "",
    qualityId: "",
    colorCodeId: "",
  });
  const [dimensionId, setDimensionId] = useState("");
  const [finishingTypeId, setFinishingTypeId] = useState("");
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [targetLocationId, setTargetLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [dimensions, setDimensions] = useState<
    { id: string; name: string }[]
  >([]);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");

  useState(() => {
    supabase
      .from("sample_dimensions")
      .select("id, name")
      .order("name")
      .then(({ data }) => setDimensions(data ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setStatus("saving");
    setErrorMsg("");

    const { error } = await supabase.from("finishing_batches").insert({
      quality_id: product.qualityId,
      color_code_id: product.colorCodeId,
      dimension_id: dimensionId,
      finishing_type_id: finishingTypeId,
      source_location_id: sourceLocationId,
      target_location_id: targetLocationId,
      quantity: parseInt(quantity, 10),
      finished_by: user.id,
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("success");
      setQuantity("");
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Afwerk-batch registreren</h2>

      <Card>
        <CardHeader>
          <CardTitle>Nieuwe afwerk-batch</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <ProductSelector onSelect={setProduct} />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Maat</Label>
                <Select value={dimensionId} onValueChange={setDimensionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer maat" />
                  </SelectTrigger>
                  <SelectContent>
                    {dimensions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <FinishingSelector
                qualityId={product.qualityId}
                onSelect={setFinishingTypeId}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-gray-500">Van locatie (gesneden)</Label>
                <LocationPicker onSelect={setSourceLocationId} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-gray-500">Naar locatie (afgewerkt)</Label>
                <LocationPicker onSelect={setTargetLocationId} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Aantal</Label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Aantal staaltjes"
                required
              />
            </div>

            {status === "error" && (
              <p className="text-sm text-red-600">{errorMsg}</p>
            )}
            {status === "success" && (
              <p className="text-sm text-green-600">
                Afwerk-batch succesvol geregistreerd!
              </p>
            )}

            <Button
              type="submit"
              disabled={
                status === "saving" ||
                !product.qualityId ||
                !product.colorCodeId ||
                !dimensionId ||
                !finishingTypeId ||
                !sourceLocationId ||
                !targetLocationId ||
                !quantity
              }
            >
              {status === "saving" ? "Opslaan..." : "Registreren"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify page renders**

```bash
npm run dev
```

Navigate to `/production/finishing` — should show the form with product selector + finishing selector.

- [ ] **Step 3: Commit**

```bash
git add src/
git commit -m "feat: add finishing batch registration page"
```

---

## Task 13: Production — Bundle Assembly Page

**Files:**
- Create: `src/app/production/bundles/page.tsx`

- [ ] **Step 1: Create bundle assembly page**

Create `src/app/production/bundles/page.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LocationPicker } from "@/components/location-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/auth/auth-provider";

interface BundleConfig {
  id: string;
  name: string;
}

export default function BundleAssemblyPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [configs, setConfigs] = useState<BundleConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState("");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    supabase
      .from("bundle_configs")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setConfigs(data ?? []));
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setStatus("saving");
    setErrorMsg("");

    const { error } = await supabase.from("bundle_batches").insert({
      bundle_config_id: selectedConfig,
      location_id: locationId,
      quantity: parseInt(quantity, 10),
      assembled_by: user.id,
    });

    if (error) {
      setStatus("error");
      setErrorMsg(
        error.message.includes("Insufficient")
          ? "Onvoldoende afgewerkte voorraad voor deze bundel!"
          : error.message
      );
    } else {
      setStatus("success");
      setQuantity("");
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Bundels samenstellen</h2>

      <Card>
        <CardHeader>
          <CardTitle>Nieuwe bundel-batch</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>Bundel-configuratie</Label>
              <Select value={selectedConfig} onValueChange={setSelectedConfig}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer bundel" />
                </SelectTrigger>
                <SelectContent>
                  {configs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <LocationPicker onSelect={setLocationId} />

            <div className="space-y-2">
              <Label>Aantal bundels</Label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Aantal bundels"
                required
              />
            </div>

            {status === "error" && (
              <p className="text-sm text-red-600">{errorMsg}</p>
            )}
            {status === "success" && (
              <p className="text-sm text-green-600">
                Bundels succesvol samengesteld!
              </p>
            )}

            <Button
              type="submit"
              disabled={
                status === "saving" || !selectedConfig || !locationId || !quantity
              }
            >
              {status === "saving" ? "Opslaan..." : "Samenstellen"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify page renders**

```bash
npm run dev
```

Navigate to `/production/bundles`.

- [ ] **Step 3: Commit**

```bash
git add src/
git commit -m "feat: add bundle assembly page"
```

---

## Task 14: Pipeline View Component & Stock Table

**Files:**
- Create: `src/components/pipeline-view.tsx`
- Create: `src/components/stock-table.tsx`
- Create: `__tests__/components/stock-table.test.tsx`

- [ ] **Step 1: Install shadcn table component**

```bash
npx shadcn@latest add table
```

- [ ] **Step 2: Create stock table component**

Create `src/components/stock-table.tsx`:
```typescript
"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StockRow {
  id: string;
  label: string;
  quantity: number;
  location?: string;
  [key: string]: unknown;
}

interface StockTableProps {
  title: string;
  columns: { key: string; label: string }[];
  rows: StockRow[];
}

export function StockTable({ title, columns, rows }: StockTableProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Geen voorraad gevonden.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {String(row[col.key] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create pipeline view component**

Create `src/components/pipeline-view.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PipelineStats {
  raw_total: number;
  finished_total: number;
  bundle_total: number;
}

export function PipelineView() {
  const supabase = createClient();
  const [stats, setStats] = useState<PipelineStats>({
    raw_total: 0,
    finished_total: 0,
    bundle_total: 0,
  });

  async function loadStats() {
    const [rawResult, finishedResult, bundleResult] = await Promise.all([
      supabase.from("raw_stock").select("quantity"),
      supabase.from("finished_stock").select("quantity"),
      supabase.from("bundle_stock").select("quantity"),
    ]);

    setStats({
      raw_total: (rawResult.data ?? []).reduce(
        (sum, r) => sum + (r.quantity ?? 0),
        0
      ),
      finished_total: (finishedResult.data ?? []).reduce(
        (sum, r) => sum + (r.quantity ?? 0),
        0
      ),
      bundle_total: (bundleResult.data ?? []).reduce(
        (sum, r) => sum + (r.quantity ?? 0),
        0
      ),
    });
  }

  useEffect(() => {
    loadStats();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("stock-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "raw_stock" },
        () => loadStats()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finished_stock" },
        () => loadStats()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bundle_stock" },
        () => loadStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const stages = [
    {
      label: "Gesneden",
      value: stats.raw_total,
      color: "bg-orange-100 text-orange-800",
    },
    {
      label: "Afgewerkt",
      value: stats.finished_total,
      color: "bg-yellow-100 text-yellow-800",
    },
    {
      label: "Bundels",
      value: stats.bundle_total,
      color: "bg-green-100 text-green-800",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {stages.map((stage, i) => (
        <Card key={stage.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              {i > 0 && "→ "}
              {stage.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold rounded-md px-3 py-1 inline-block ${stage.color}`}>
              {stage.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write test for stock table**

Create `__tests__/components/stock-table.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import { StockTable } from "@/components/stock-table";

describe("StockTable", () => {
  it("renders rows with correct data", () => {
    const columns = [
      { key: "label", label: "Product" },
      { key: "quantity", label: "Aantal" },
    ];
    const rows = [
      { id: "1", label: "Milano Velour 001", quantity: 50 },
      { id: "2", label: "Milano Bouclé 002", quantity: 30 },
    ];

    render(<StockTable title="Test Voorraad" columns={columns} rows={rows} />);

    expect(screen.getByText("Test Voorraad")).toBeInTheDocument();
    expect(screen.getByText("Milano Velour 001")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("shows empty message when no rows", () => {
    render(<StockTable title="Leeg" columns={[]} rows={[]} />);
    expect(screen.getByText("Geen voorraad gevonden.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run test**

```bash
npm test -- __tests__/components/stock-table.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ __tests__/
git commit -m "feat: add pipeline view with realtime updates and stock table component"
```

---

## Task 15: Sales — Availability & Delivery Pages

**Files:**
- Create: `src/app/sales/availability/page.tsx`
- Create: `src/app/sales/delivery/page.tsx`

- [ ] **Step 1: Create availability page**

Create `src/app/sales/availability/page.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PipelineView } from "@/components/pipeline-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface BundleAvailability {
  bundle_config_id: string;
  bundle_name: string;
  bundles_ready: number;
  bundles_makeable: number;
}

export default function AvailabilityPage() {
  const supabase = createClient();
  const [availability, setAvailability] = useState<BundleAvailability[]>([]);

  async function loadAvailability() {
    const { data } = await supabase
      .from("v_bundle_availability")
      .select("*")
      .order("bundle_name");
    setAvailability((data as BundleAvailability[]) ?? []);
  }

  useEffect(() => {
    loadAvailability();

    const channel = supabase
      .channel("bundle-availability")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bundle_stock" },
        () => loadAvailability()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finished_stock" },
        () => loadAvailability()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Beschikbaarheid</h2>

      <PipelineView />

      <Card>
        <CardHeader>
          <CardTitle>Bundel-beschikbaarheid</CardTitle>
        </CardHeader>
        <CardContent>
          {availability.length === 0 ? (
            <p className="text-sm text-gray-500">Geen bundel-configuraties gevonden.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bundel</TableHead>
                  <TableHead>Klaar</TableHead>
                  <TableHead>Maakbaar uit voorraad</TableHead>
                  <TableHead>Totaal beschikbaar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availability.map((row) => (
                  <TableRow key={row.bundle_config_id}>
                    <TableCell className="font-medium">{row.bundle_name}</TableCell>
                    <TableCell>
                      <span className="inline-block rounded bg-green-100 px-2 py-1 text-green-800">
                        {row.bundles_ready}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-block rounded bg-yellow-100 px-2 py-1 text-yellow-800">
                        {row.bundles_makeable}
                      </span>
                    </TableCell>
                    <TableCell className="font-bold">
                      {row.bundles_ready + row.bundles_makeable}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create delivery estimates page**

Create `src/app/sales/delivery/page.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PipelineRow {
  quality_name: string;
  color_code: string;
  color_name: string;
  dimension_name: string;
  raw_stock_total: number;
  finished_stock_total: number;
}

export default function DeliveryPage() {
  const supabase = createClient();
  const [pipeline, setPipeline] = useState<PipelineRow[]>([]);

  useEffect(() => {
    supabase
      .from("v_pipeline_status")
      .select("*")
      .order("quality_name")
      .then(({ data }) => setPipeline((data as PipelineRow[]) ?? []));
  }, [supabase]);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Levertijden & Pipeline</h2>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline-overzicht per product</CardTitle>
        </CardHeader>
        <CardContent>
          {pipeline.length === 0 ? (
            <p className="text-sm text-gray-500">Geen data beschikbaar.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kwaliteit</TableHead>
                  <TableHead>Kleur</TableHead>
                  <TableHead>Maat</TableHead>
                  <TableHead>Gesneden</TableHead>
                  <TableHead>Afgewerkt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pipeline.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{row.quality_name}</TableCell>
                    <TableCell>{row.color_code} — {row.color_name}</TableCell>
                    <TableCell>{row.dimension_name}</TableCell>
                    <TableCell>
                      <span className="inline-block rounded bg-orange-100 px-2 py-1 text-orange-800">
                        {row.raw_stock_total}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-block rounded bg-yellow-100 px-2 py-1 text-yellow-800">
                        {row.finished_stock_total}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Verify both pages render**

```bash
npm run dev
```

Navigate to `/sales/availability` and `/sales/delivery`.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: add sales availability and delivery estimate pages"
```

---

## Task 16: Management Dashboard & Production Overview

**Files:**
- Modify: `src/app/management/page.tsx`
- Modify: `src/app/production/page.tsx`
- Modify: `src/app/sales/page.tsx`

- [ ] **Step 1: Update production overview**

Modify `src/app/production/page.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PipelineView } from "@/components/pipeline-view";
import { StockTable } from "@/components/stock-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProductionDashboard() {
  const supabase = createClient();
  const [recentCuts, setRecentCuts] = useState<any[]>([]);
  const [recentFinishing, setRecentFinishing] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("cut_batches")
      .select("id, quantity, cut_date, qualities(name), color_codes(code, name)")
      .order("cut_date", { ascending: false })
      .limit(10)
      .then(({ data }) => setRecentCuts(data ?? []));

    supabase
      .from("finishing_batches")
      .select("id, quantity, started_at, qualities(name), color_codes(code, name), finishing_types(name)")
      .order("started_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setRecentFinishing(data ?? []));
  }, [supabase]);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Productie Overzicht</h2>
      <PipelineView />

      <div className="grid grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recente snij-batches</CardTitle>
          </CardHeader>
          <CardContent>
            <StockTable
              title=""
              columns={[
                { key: "label", label: "Product" },
                { key: "quantity", label: "Aantal" },
              ]}
              rows={recentCuts.map((c) => ({
                id: c.id,
                label: `${c.qualities?.name} ${c.color_codes?.code}`,
                quantity: c.quantity,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recente afwerk-batches</CardTitle>
          </CardHeader>
          <CardContent>
            <StockTable
              title=""
              columns={[
                { key: "label", label: "Product" },
                { key: "finishing", label: "Afwerking" },
                { key: "quantity", label: "Aantal" },
              ]}
              rows={recentFinishing.map((f) => ({
                id: f.id,
                label: `${f.qualities?.name} ${f.color_codes?.code}`,
                finishing: f.finishing_types?.name ?? "",
                quantity: f.quantity,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update management overview**

Modify `src/app/management/page.tsx`:
```typescript
"use client";

import { PipelineView } from "@/components/pipeline-view";

export default function ManagementDashboard() {
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Management Overzicht</h2>
      <PipelineView />
      <p className="text-sm text-gray-500">
        Klant- en prijsbeheer wordt in een volgende fase toegevoegd.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Update sales overview**

Modify `src/app/sales/page.tsx`:
```typescript
"use client";

import { PipelineView } from "@/components/pipeline-view";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SalesDashboard() {
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Verkoop Overzicht</h2>
      <PipelineView />
      <div className="grid grid-cols-2 gap-4">
        <Link href="/sales/availability">
          <Card className="hover:bg-gray-50 cursor-pointer transition-colors">
            <CardHeader>
              <CardTitle className="text-base">Beschikbaarheid</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Bundel-voorraad en maakbaarheid bekijken
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/sales/delivery">
          <Card className="hover:bg-gray-50 cursor-pointer transition-colors">
            <CardHeader>
              <CardTitle className="text-base">Levertijden</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Pipeline-overzicht en levertijd-inschatting
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify all dashboards**

```bash
npm run dev
```

Check `/production`, `/sales`, `/management` — each should show pipeline view + relevant content.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat: add dashboard overviews with pipeline view for all roles"
```

---

## Task 17: Location Management Page

**Files:**
- Create: `src/app/production/locations/page.tsx`

- [ ] **Step 1: Create locations page**

Create `src/app/production/locations/page.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Location {
  id: string;
  aisle: string;
  rack: string;
  level: string;
  label: string;
}

export default function LocationsPage() {
  const supabase = createClient();
  const [locations, setLocations] = useState<Location[]>([]);
  const [aisle, setAisle] = useState("");
  const [rack, setRack] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle"
  );

  async function loadLocations() {
    const { data } = await supabase
      .from("locations")
      .select("*")
      .order("label");
    setLocations(data ?? []);
  }

  useEffect(() => {
    loadLocations();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");

    const { error } = await supabase
      .from("locations")
      .insert({ aisle, rack, level });

    if (error) {
      setStatus("error");
    } else {
      setStatus("success");
      setAisle("");
      setRack("");
      setLevel("");
      loadLocations();
    }
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Locatiebeheer</h2>

      <Card>
        <CardHeader>
          <CardTitle>Nieuwe locatie toevoegen</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex items-end gap-4">
            <div className="space-y-2">
              <Label>Gangpad</Label>
              <Input
                value={aisle}
                onChange={(e) => setAisle(e.target.value)}
                placeholder="A"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Stelling</Label>
              <Input
                value={rack}
                onChange={(e) => setRack(e.target.value)}
                placeholder="1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Laag</Label>
              <Input
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="1"
                required
              />
            </div>
            <Button type="submit" disabled={status === "saving"}>
              Toevoegen
            </Button>
          </form>
          {status === "success" && (
            <p className="mt-2 text-sm text-green-600">Locatie toegevoegd!</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alle locaties</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Gangpad</TableHead>
                <TableHead>Stelling</TableHead>
                <TableHead>Laag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((loc) => (
                <TableRow key={loc.id}>
                  <TableCell className="font-medium">{loc.label}</TableCell>
                  <TableCell>{loc.aisle}</TableCell>
                  <TableCell>{loc.rack}</TableCell>
                  <TableCell>{loc.level}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm run dev
```

Navigate to `/production/locations`.

- [ ] **Step 3: Commit**

```bash
git add src/
git commit -m "feat: add location management page"
```

---

## Task 18: Enable Supabase Realtime & Final Verification

**Files:**
- No new files — configuration + end-to-end verification

- [ ] **Step 1: Enable Realtime for stock tables**

In Supabase Dashboard → Database → Replication, enable realtime for:
- `raw_stock`
- `finished_stock`
- `bundle_stock`

Or via SQL:
```sql
alter publication supabase_realtime add table public.raw_stock;
alter publication supabase_realtime add table public.finished_stock;
alter publication supabase_realtime add table public.bundle_stock;
```

- [ ] **Step 2: Create test users with roles**

In Supabase Dashboard → Authentication → Users, create:
- `productie@karpi.nl` with `app_metadata: {"role": "production"}`
- `verkoop@karpi.nl` with `app_metadata: {"role": "sales"}`
- `admin@karpi.nl` with `app_metadata: {"role": "admin"}`

Or via SQL:
```sql
-- After creating users via dashboard, set their roles:
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role": "production"}'
where email = 'productie@karpi.nl';
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role": "sales"}'
where email = 'verkoop@karpi.nl';
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'
where email = 'admin@karpi.nl';
```

- [ ] **Step 3: End-to-end test flow**

1. Log in as `productie@karpi.nl` → should redirect to `/production`
2. Go to `/production/cut` → register a cut batch (Milano Velour, 001, 20x20, 50 stuks, locatie A-1-1)
3. Check pipeline view updates in real-time
4. Go to `/production/finishing` → register a finishing batch from the raw stock
5. Go to `/production/bundles` → assemble a bundle (if bundle configs exist)
6. Open second browser → log in as `verkoop@karpi.nl`
7. Check `/sales/availability` — should show updated stock
8. Verify realtime: register another batch in production browser → sales browser updates live

- [ ] **Step 4: Run build to verify no errors**

```bash
npm run build
```

Expected: Build succeeds without errors.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: enable realtime subscriptions and finalize phase 1+2"
```
