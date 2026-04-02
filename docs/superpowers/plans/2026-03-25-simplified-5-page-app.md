# Simplified 5-Page App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Karpi sample management app from 3-section multi-page layout to 5 flat pages: Orders, Stalen + Voorraad, Collecties & Bundels, Productie, Klanten.

**Architecture:** Clean slate route structure with flat sidebar navigation. Database migrations add new tables (`samples`, `orders`, `order_lines`, `carpet_dimensions`, `quality_carpet_dimensions`, `client_carpet_prices`) and modify existing ones (`collection_bundles` gets `position`). Existing batch/trigger pipeline stays intact — quick entry creates batch records that feed through existing triggers. Supabase REST API for all data access; no MCP tools (project on client account `mbqvhpdwtgtfbnscqrul`).

**Tech Stack:** Next.js 15.3.8, React 19, TypeScript, Tailwind CSS v4, shadcn/ui v4 (@base-ui/react), Supabase (PostgreSQL + Auth + Storage), Lucide icons. All UI text in Dutch.

**Spec:** `docs/superpowers/specs/2026-03-25-simplified-5-page-app-design.md`

---

## File Structure

### New files to create

```
src/app/
├── (app)/                          # Route group for authenticated pages
│   ├── layout.tsx                  # Shared layout: new flat sidebar + main content
│   ├── orders/
│   │   ├── page.tsx                # Orders overview table
│   │   └── [id]/
│   │       └── page.tsx            # Order detail + print stickers
│   ├── stalen/
│   │   └── page.tsx                # Stalen + Voorraad with quick entry
│   ├── collecties/
│   │   └── page.tsx                # Collecties & Bundels tabs
│   ├── productie/
│   │   └── page.tsx                # Productie tekorten-overzicht
│   └── klanten/
│       ├── page.tsx                # Klanten overview
│       └── [id]/
│           └── page.tsx            # Klant detail (3 tabs)

src/components/
├── app-sidebar.tsx                 # New flat 5-item sidebar
├── quick-entry-modal.tsx           # Snelle invoer modal (3-step)
├── order-create-modal.tsx          # Order aanmaken modal (4-step)
├── sticker-print.tsx               # Sticker layout + print trigger
├── price-calculator.tsx            # Adviesprijs calculator
├── sample-form-modal.tsx           # Sample CRUD modal
├── production-resolve-modal.tsx    # Production check-off modal
└── logo-upload.tsx                 # Client logo upload component

supabase/migrations/
├── 008_add_samples_table.sql
├── 009_add_carpet_dimensions.sql
├── 010_add_orders.sql
├── 011_add_collection_bundle_position.sql
└── 012_drop_deprecated_tables.sql

Note: If `supabase db push` requires timestamp-format filenames (YYYYMMDDHHMMSS_desc.sql),
rename accordingly. The numbered prefix is for plan readability only.
```

### Files to modify

```
src/app/layout.tsx                  # Remove AuthProvider wrapping (moved to route group)
src/app/page.tsx                    # Change redirect: / → /orders
src/middleware.ts                   # Simplify: remove role-based route restrictions
src/lib/supabase/types.ts           # Add new table types, remove deprecated
src/components/auth/auth-provider.tsx  # No changes needed (reuse as-is)
```

### Files that remain but are no longer navigable

Old routes under `/production/*`, `/sales/*`, `/management/*` stay in the codebase but are not linked from the new sidebar. No deletions needed.

---

## Task 1: Database Migration — `samples` table

**Files:**
- Create: `supabase/migrations/008_add_samples_table.sql`
- Modify: `src/lib/supabase/types.ts` (add `samples` type)

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/008_add_samples_table.sql

-- Materialize samples as first-class entities
CREATE TABLE IF NOT EXISTS samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_id uuid NOT NULL REFERENCES qualities(id),
  color_code_id uuid NOT NULL REFERENCES color_codes(id),
  dimension_id uuid NOT NULL REFERENCES sample_dimensions(id),
  photo_url text,
  description text,
  min_stock integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quality_id, color_code_id, dimension_id)
);

-- Index for lookups
CREATE INDEX idx_samples_quality ON samples(quality_id);
CREATE INDEX idx_samples_active ON samples(active) WHERE active = true;

-- Enable RLS
ALTER TABLE samples ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "samples_select" ON samples FOR SELECT TO authenticated USING (true);

-- Only production and admin can insert/update
CREATE POLICY "samples_insert" ON samples FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt()->'app_metadata'->>'role') IN ('production', 'admin')
  );

CREATE POLICY "samples_update" ON samples FOR UPDATE TO authenticated
  USING (
    (auth.jwt()->'app_metadata'->>'role') IN ('production', 'admin')
  );
```

- [ ] **Step 2: Add `samples` type to `types.ts`**

Add after the `sample_dimensions` entry in `src/lib/supabase/types.ts`:

```typescript
samples: {
  Row: { id: string; quality_id: string; color_code_id: string; dimension_id: string; photo_url: string | null; description: string | null; min_stock: number; active: boolean; created_at: string };
  Insert: { id?: string; quality_id: string; color_code_id: string; dimension_id: string; photo_url?: string | null; description?: string | null; min_stock?: number; active?: boolean };
  Update: { quality_id?: string; color_code_id?: string; dimension_id?: string; photo_url?: string | null; description?: string | null; min_stock?: number; active?: boolean };
  Relationships: [];
};
```

- [ ] **Step 3: Push migration to Supabase**

Run: `cd karpi-sample-management && npx supabase db push`

Expected: Migration applied successfully.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/008_add_samples_table.sql src/lib/supabase/types.ts
git commit -m "feat: add samples table migration"
```

---

## Task 2: Database Migration — carpet dimensions & client pricing

**Files:**
- Create: `supabase/migrations/009_add_carpet_dimensions.sql`
- Modify: `src/lib/supabase/types.ts` (add 3 new table types)

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/009_add_carpet_dimensions.sql

-- Full-size rug dimensions (NOT sample sizes)
CREATE TABLE IF NOT EXISTS carpet_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  width_cm integer NOT NULL,
  height_cm integer NOT NULL,
  name text NOT NULL,  -- e.g. "080×150"
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Which carpet dimensions are available per quality
CREATE TABLE IF NOT EXISTS quality_carpet_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_id uuid NOT NULL REFERENCES qualities(id),
  carpet_dimension_id uuid NOT NULL REFERENCES carpet_dimensions(id),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (quality_id, carpet_dimension_id)
);

-- Client retail prices per quality per carpet dimension
CREATE TABLE IF NOT EXISTS client_carpet_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  quality_id uuid NOT NULL REFERENCES qualities(id),
  carpet_dimension_id uuid REFERENCES carpet_dimensions(id),  -- NULL = "afwijkende maten"
  price_cents integer NOT NULL,  -- price in cents incl. BTW
  unit text NOT NULL DEFAULT 'piece' CHECK (unit IN ('piece', 'm2')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (client_id, quality_id, carpet_dimension_id)
);

-- Indexes
CREATE INDEX idx_quality_carpet_dims ON quality_carpet_dimensions(quality_id);
CREATE INDEX idx_client_carpet_prices_client ON client_carpet_prices(client_id);
CREATE INDEX idx_client_carpet_prices_quality ON client_carpet_prices(quality_id);

-- RLS
ALTER TABLE carpet_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_carpet_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_carpet_prices ENABLE ROW LEVEL SECURITY;

-- All authenticated can read
CREATE POLICY "carpet_dimensions_select" ON carpet_dimensions FOR SELECT TO authenticated USING (true);
CREATE POLICY "quality_carpet_dimensions_select" ON quality_carpet_dimensions FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_carpet_prices_select" ON client_carpet_prices FOR SELECT TO authenticated USING (true);

-- Admin can manage
CREATE POLICY "carpet_dimensions_admin" ON carpet_dimensions FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "quality_carpet_dimensions_admin" ON quality_carpet_dimensions FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'));

CREATE POLICY "client_carpet_prices_admin" ON client_carpet_prices FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'));

-- Seed common carpet dimensions
INSERT INTO carpet_dimensions (width_cm, height_cm, name) VALUES
  (80, 150, '080×150'),
  (130, 190, '130×190'),
  (160, 230, '160×230'),
  (200, 290, '200×290'),
  (240, 330, '240×330');
```

- [ ] **Step 2: Add types to `types.ts`**

Add `carpet_dimensions`, `quality_carpet_dimensions`, and `client_carpet_prices` types following the pattern in `types.ts`. See spec for field definitions.

- [ ] **Step 3: Push migration**

Run: `cd karpi-sample-management && npx supabase db push`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/009_add_carpet_dimensions.sql src/lib/supabase/types.ts
git commit -m "feat: add carpet dimensions and client pricing tables"
```

---

## Task 3: Database Migration — orders & order lines

**Files:**
- Create: `supabase/migrations/010_add_orders.sql`
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/010_add_orders.sql

-- Function to generate per-year order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS text AS $$
DECLARE
  year_str text;
  next_num integer;
BEGIN
  year_str := to_char(now(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM '#' || year_str || '-(\d+)') AS integer)
  ), 0) + 1
  INTO next_num
  FROM orders
  WHERE order_number LIKE '#' || year_str || '-%';
  RETURN '#' || year_str || '-' || lpad(next_num::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT generate_order_number(),
  client_id uuid NOT NULL REFERENCES clients(id),
  collection_id uuid NOT NULL REFERENCES collections(id),
  delivery_date date NOT NULL,
  status text NOT NULL DEFAULT 'restock_needed'
    CHECK (status IN ('picking_ready', 'restock_needed', 'completed')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Order lines (bundles in the order)
CREATE TABLE IF NOT EXISTS order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  bundle_id uuid NOT NULL REFERENCES bundles(id),
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_orders_client ON orders(client_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_delivery ON orders(delivery_date);
CREATE INDEX idx_order_lines_order ON order_lines(order_id);
CREATE INDEX idx_order_lines_bundle ON order_lines(bundle_id);

-- RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "order_lines_select" ON order_lines FOR SELECT TO authenticated USING (true);

CREATE POLICY "orders_insert" ON orders FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'));
CREATE POLICY "orders_update" ON orders FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'));

CREATE POLICY "order_lines_insert" ON order_lines FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'));

CREATE POLICY "order_lines_update" ON order_lines FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'));

CREATE POLICY "order_lines_delete" ON order_lines FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'));

-- Auto-populate order_lines from collection bundles on order insert
CREATE OR REPLACE FUNCTION populate_order_lines()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO order_lines (order_id, bundle_id, quantity)
  SELECT NEW.id, cb.bundle_id, 1
  FROM collection_bundles cb
  WHERE cb.collection_id = NEW.collection_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_populate_order_lines
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION populate_order_lines();
```

- [ ] **Step 2: Add types to `types.ts`**

Add `orders` and `order_lines` types.

- [ ] **Step 3: Push migration**

Run: `cd karpi-sample-management && npx supabase db push`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/010_add_orders.sql src/lib/supabase/types.ts
git commit -m "feat: add orders and order lines tables with auto-populate trigger"
```

---

## Task 4: Database Migration — collection_bundles position + cleanup

**Files:**
- Create: `supabase/migrations/011_add_collection_bundle_position.sql`
- Create: `supabase/migrations/012_drop_deprecated_tables.sql`
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Write position migration**

```sql
-- supabase/migrations/011_add_collection_bundle_position.sql

ALTER TABLE collection_bundles ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- Backfill positions based on creation order
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY collection_id ORDER BY id) - 1 AS pos
  FROM collection_bundles
)
UPDATE collection_bundles cb SET position = n.pos FROM numbered n WHERE cb.id = n.id;
```

- [ ] **Step 2: Write deprecation migration**

```sql
-- supabase/migrations/012_drop_deprecated_tables.sql

-- Phase 4 tables replaced by orders + order_lines
DROP TABLE IF EXISTS bundle_reservations;
DROP TABLE IF EXISTS bundle_requests;
DROP TABLE IF EXISTS projects;

-- client_retail_prices replaced by client_carpet_prices
DROP TABLE IF EXISTS client_retail_prices;
```

- [ ] **Step 3: Update types.ts**

- Add `position` field to `collection_bundles` Row/Insert/Update
- Remove `projects`, `bundle_requests`, `bundle_reservations`, `client_retail_prices` types

- [ ] **Step 4: Push migrations**

Run: `cd karpi-sample-management && npx supabase db push`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/011_add_collection_bundle_position.sql supabase/migrations/012_drop_deprecated_tables.sql src/lib/supabase/types.ts
git commit -m "feat: add collection_bundles position, drop deprecated tables"
```

---

## Task 5: New Sidebar & Layout

**Files:**
- Create: `src/components/app-sidebar.tsx`
- Create: `src/app/(app)/layout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Create new flat sidebar component**

Create `src/components/app-sidebar.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";
import {
  ClipboardList,
  Layers,
  Package,
  Factory,
  Users,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/stalen", label: "Stalen & Voorraad", icon: Layers },
  { href: "/collecties", label: "Collecties & Bundels", icon: Package },
  { href: "/productie", label: "Productie", icon: Factory },
  { href: "/klanten", label: "Klanten", icon: Users },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  // Get user initials for avatar
  const email = user?.email ?? "";
  const initials = email.substring(0, 2).toUpperCase();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="border-b border-border px-5 py-4">
        <span className="text-lg font-bold tracking-wide">KARPI</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-3 px-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            {initials}
          </div>
          <span className="flex-1 truncate text-sm">{email}</span>
          <button
            onClick={handleLogout}
            className="text-sidebar-foreground/50 hover:text-sidebar-foreground"
            title="Uitloggen"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create route group layout**

Create `src/app/(app)/layout.tsx`:

```tsx
import { AuthProvider } from "@/components/auth/auth-provider";
import { AppSidebar } from "@/components/app-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex h-screen">
        <AppSidebar />
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
```

- [ ] **Step 3: Update root page redirect**

Modify `src/app/page.tsx` to redirect to `/orders` instead of role-based routing:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/orders");
}
```

- [ ] **Step 4: Simplify middleware**

Modify `src/middleware.ts`: remove role-based route restrictions (lines ~50-65 in current file). Keep only auth check. The simplified logic:

```typescript
// Allow public routes
if (pathname === "/login" || pathname.startsWith("/auth/callback")) {
  return res;
}
// Check auth — redirect to /login if not authenticated
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  return NextResponse.redirect(new URL("/login", req.url));
}
// Already logged in and visiting /login → redirect to /orders
if (pathname === "/login" && user) {
  return NextResponse.redirect(new URL("/orders", req.url));
}
```

Remove all role-based checks (`production`, `sales`, `admin` route restrictions). All authenticated users access all routes.

- [ ] **Step 5: Verify build**

Run: `cd karpi-sample-management && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/app-sidebar.tsx src/app/\(app\)/layout.tsx src/app/page.tsx src/middleware.ts
git commit -m "feat: add flat 5-item sidebar and route group layout"
```

---

## Task 6: Stalen + Voorraad page

This is the most complex page. Build it first as other pages depend on its stock data.

**Files:**
- Create: `src/app/(app)/stalen/page.tsx`
- Create: `src/components/quick-entry-modal.tsx`
- Create: `src/components/sample-form-modal.tsx`

- [ ] **Step 1: Create the Stalen page**

Create `src/app/(app)/stalen/page.tsx` with:

- Client component (`"use client"`)
- Fetch from Supabase: `samples` joined with `qualities`, `color_codes`, `sample_dimensions`
- Aggregate stock: SUM `raw_stock.quantity` grouped by (quality_id, color_code_id, dimension_id) for "gesneden"
- Aggregate stock: SUM `finished_stock.quantity` grouped by same keys for "afgewerkt"
- Calculate backorders: query `orders` (status ≠ 'completed') → `order_lines` → `bundles` → `bundle_colors` to get needed counts per sample
- Calculate vrije voorraad: afgewerkt − backorders
- Table with columns: Staal (thumbnail + name), Kwaliteit, Kleur, Afmeting, ✂️ Gesneden, ✅ Afgewerkt, Backorders, Vrij, Min.
- Row backgrounds: red if vrij < 0, yellow if vrij ≤ min_stock
- Expandable rows showing location breakdown (raw_stock by location for gesneden, finished_stock by location for afgewerkt)
- Filters: search input, quality dropdown, dimension dropdown
- Buttons: "+ Nieuw staal" (opens sample form), "⚡ Snelle invoer" (opens quick entry)

Key Supabase queries:
- `supabase.from('samples').select('*, qualities(*), color_codes(*), sample_dimensions(*)').eq('active', true)`
- `supabase.from('raw_stock').select('quality_id, color_code_id, dimension_id, location_id, quantity, locations(label)')`
- `supabase.from('finished_stock').select('quality_id, color_code_id, dimension_id, location_id, quantity, locations(label)')`
- For backorders: `supabase.from('orders').select('order_lines(bundle_id, quantity, bundles(quality_id, dimension_id, bundle_colors(color_code_id)))').neq('status', 'completed')`

**Performance note:** The backorder query is a 4-level nested join. If this becomes slow with many orders, create a database view `v_sample_backorders` that pre-aggregates needed quantities per (quality_id, color_code_id, dimension_id). For initial launch with ~10 users and few orders, the client-side approach is fine.

- [ ] **Step 2: Create quick entry modal**

Create `src/components/quick-entry-modal.tsx`:

- 3-step flow: search sample → quantity + status (gesneden/afgewerkt) → location → book
- Search: filter samples by quality/color name with autocomplete
- Status toggle: two buttons "✂️ Gesneden" / "✅ Afgewerkt"
- Quantity: +/− buttons with number input
- Location: three dropdowns (Gang/Rek/Niveau) from `locations` table
- On book (gesneden): insert into `cut_batches` with `cut_by = user.id`
- On book (afgewerkt): insert into `finishing_batches` with `finished_by = user.id`. Uses the first allowed `finishing_type_id` for the sample's quality (via `quality_finishing_rules` where `is_allowed = true`). Uses same location for source and target for simplicity. If no finishing rule exists, fall back to the first `finishing_types` entry.
- Success state: green banner with "Volgende boeken →" button
- Props: `open`, `onOpenChange`, `onBooked` (callback to refresh parent)

- [ ] **Step 3: Create sample form modal**

Create `src/components/sample-form-modal.tsx`:

- Modal for creating/editing samples
- Fields: quality (dropdown), color (dependent dropdown), dimension (dropdown), description (textarea), min_stock (number input), photo (file upload to Supabase Storage bucket `sample-photos`)
- On save: upsert to `samples` table
- Props: `open`, `onOpenChange`, `sample?` (for edit mode), `onSaved` callback

- [ ] **Step 4: Verify the page works**

Run: `cd karpi-sample-management && npm run dev`

Navigate to `http://localhost:3000/stalen`. Verify:
- Table renders with sample data
- Filters work
- Expandable rows show locations
- Quick entry modal opens and can book stock
- Sample form modal opens for create/edit

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/stalen/page.tsx src/components/quick-entry-modal.tsx src/components/sample-form-modal.tsx
git commit -m "feat: add Stalen + Voorraad page with quick entry and sample CRUD"
```

---

## Task 7: Collecties & Bundels page

**Files:**
- Create: `src/app/(app)/collecties/page.tsx`

- [ ] **Step 1: Create the Collecties page**

Create `src/app/(app)/collecties/page.tsx` with:

- Client component
- Two tabs: "Collecties" and "Bundels" (tab state in useState)
- **Collecties tab:**
  - Fetch: `supabase.from('collections').select('*, collection_bundles(*, bundles(*, qualities(*), sample_dimensions(*), bundle_colors(*, color_codes(*))))').eq('active', true).order('name')`
  - Expandable list: click collection → shows bundles in position order
  - Bundle reordering: up/down arrow buttons that update `collection_bundles.position` via `supabase.from('collection_bundles').update({ position }).eq('id', id)`
  - "Bundel toevoegen" button: dropdown to pick from unassigned bundles, inserts to `collection_bundles`
  - Remove bundle: delete from `collection_bundles`
  - Create collection: inline form (name input + save)
  - Edit collection: inline name edit
  - Delete collection: soft-delete via `active = false`
- **Bundels tab:**
  - Fetch: `supabase.from('bundles').select('*, qualities(*), sample_dimensions(*), bundle_colors(*, color_codes(*)), collection_bundles(collection_id, collections(name))').eq('active', true)`
  - Expandable list: click bundle → shows color pills with swatches
  - Shows "In X collecties" badge + collection names
  - Create bundle: form with name, quality, dimension, colors
  - Edit bundle: inline editing
  - Delete bundle: soft-delete

Reuse patterns from existing `src/components/compose/collections-tab.tsx` and `bundles-tab.tsx` but rebuild as single-page with simpler structure.

- [ ] **Step 2: Verify the page works**

Run dev server, navigate to `/collecties`. Verify both tabs work with CRUD operations and position reordering.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/collecties/page.tsx
git commit -m "feat: add Collecties & Bundels page with tabs and position ordering"
```

---

## Task 8: Klanten page

**Files:**
- Create: `src/app/(app)/klanten/page.tsx`
- Create: `src/app/(app)/klanten/[id]/page.tsx`
- Create: `src/components/price-calculator.tsx`
- Create: `src/components/logo-upload.tsx`

- [ ] **Step 1: Create klanten overview page**

Create `src/app/(app)/klanten/page.tsx`:

- Fetch clients with counts: `supabase.from('clients').select('*, client_quality_names(count), orders(count)').eq('active', true)`
- Also fetch `client_carpet_prices` counts per client to determine pricing status
- Table: Klant (logo/initials + name), Klantnr., Type (Hoofdkantoor/Filiaal badge), Eigen namen (count), Prijzen (status badge), Orders (count)
- Search filter
- "+ Nieuwe klant" button: creates client with name, client_type, client_number, contact_email
- Click row → navigates to `/klanten/[id]`

- [ ] **Step 2: Create klant detail page**

Create `src/app/(app)/klanten/[id]/page.tsx`:

- Fetch client with all related data
- Header: logo (with upload), name, client_number, type, email, "Bewerken" button
- Three tabs (useState):

**Tab 1 — Eigen namen:**
- Fetch: `client_quality_names` joined with `qualities` for this client
- Table: Karpi naam → Klant naam, with edit/delete per row
- "+ Naam toevoegen" button: dropdown for quality + text input for custom name
- Uses existing `client_quality_names` data from TKA013 import

**Tab 2 — Prijzen:**
- Quality selector dropdown (shows Karpi name + client custom name)
- Fetch `quality_carpet_dimensions` for selected quality → `carpet_dimensions`
- Fetch `client_carpet_prices` for this client + quality
- Price table: maat × prijs (editable inline)
- "Afwijkende maten" row (carpet_dimension_id = NULL, unit = 'm2')
- Adviesprijs calculator component (see step 3)

**Tab 3 — Orders:**
- Fetch: `orders` where `client_id = id`, show order_number, collection, delivery_date, status
- Link to `/orders/[order_id]`

- [ ] **Step 3: Create price calculator component**

Create `src/components/price-calculator.tsx`:

- Inputs: inkoopprijs (excl. BTW), factor dropdown (×2.5, ×3.0)
- Calculation: `inkoopprijs × factor × 1.21` then round to €X9 pattern
- Rounding logic: `Math.ceil(price / 10) * 10 - 1` (e.g., 126.34 → 129, 153.67 → 159, 396.22 → 399)
- "Overnemen" button that calls `onApply(calculatedPrice)` prop
- Display: green box with calculated price

- [ ] **Step 4: Create logo upload component**

Create `src/components/logo-upload.tsx`:

- Clickable area showing current logo or placeholder
- On click: file input for image (accept image/*)
- Upload to Supabase Storage bucket `client-logos`
- Update `clients.logo_url` with the storage path
- Props: `clientId`, `currentUrl`, `onUploaded`

- [ ] **Step 5: Verify the pages work**

Navigate to `/klanten`, then click a client to view detail. Verify all 3 tabs, price calculator, and logo upload.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/klanten/ src/components/price-calculator.tsx src/components/logo-upload.tsx
git commit -m "feat: add Klanten pages with eigen namen, prijzen, logo upload"
```

---

## Task 9: Orders page

**Files:**
- Create: `src/app/(app)/orders/page.tsx`
- Create: `src/app/(app)/orders/[id]/page.tsx`
- Create: `src/components/order-create-modal.tsx`
- Create: `src/components/sticker-print.tsx`

- [ ] **Step 1: Create orders overview page**

Create `src/app/(app)/orders/page.tsx`:

- Fetch: `supabase.from('orders').select('*, clients(*), collections(*)').order('created_at', { ascending: false })`
- Table: Order number, Klant (logo/initials + name), Collectie, Levertijd, Status badge, Print stickers link
- Status badges: `picking_ready` → green "Klaar om te picken", `restock_needed` → yellow "Voorraad aanvullen", `completed` → gray "Voltooid"
- Filters: search input, status dropdown
- "+ Nieuwe order" button → opens create modal
- Click row → navigates to `/orders/[id]`

**Status calculation on load:**
For each non-completed order, check if all samples are in stock:
- Query `order_lines` → `bundles` → `bundle_colors` to get needed samples
- Query `finished_stock` aggregated by (quality_id, color_code_id, dimension_id)
- Compare: if all sufficient → `picking_ready`, if any short → `restock_needed`
- Update order status in DB if changed (except `completed` orders)

- [ ] **Step 2: Create order create modal**

Create `src/components/order-create-modal.tsx`:

- 4-step flow in a modal:
  1. Client selector: searchable dropdown from `clients`
  2. Collection selector: dropdown from `collections` (shows name + bundle count)
  3. Delivery date picker (HTML date input) + notes textarea
  4. Confirm button
- On confirm: insert into `orders` (trigger auto-populates `order_lines`)
- Props: `open`, `onOpenChange`, `onCreated`

- [ ] **Step 3: Create order detail page**

Create `src/app/(app)/orders/[id]/page.tsx`:

- Fetch order with: `supabase.from('orders').select('*, clients(*), collections(*), order_lines(*, bundles(*, qualities(*), sample_dimensions(*), bundle_colors(*, color_codes(*))))').eq('id', id).single()`
- Header: "← Terug naar orders" link, order number, client + collection name
- Summary cards: levertijd, bundels count, totaal stalen
- Status dropdown (to manually change status, especially to "Voltooid")
- Bundle table: per bundle show name, quality, color count, stock status (query finished_stock to check)
- "Print alle stickers" button → opens sticker print view

- [ ] **Step 4: Create sticker print component**

Create `src/components/sticker-print.tsx`:

- Generates printable sticker layout per sample in the order
- For each bundle in order → for each color in bundle:
  - Client logo from `clients.logo_url` (Supabase Storage URL)
  - Quality name from `client_quality_names.custom_name` (fallback to `qualities.name`)
  - Color from `color_codes.name`
  - Material from `qualities.material_type`
  - Prices from `client_carpet_prices` joined with `carpet_dimensions`
  - Disclaimer: fixed text (from spec)
- Render as a print-optimized page with `@media print` CSS
- Each sticker in a container sized for the physical label
- Button triggers `window.print()`
- Props: `orderId`, `open`, `onOpenChange`

- [ ] **Step 5: Verify**

Create a test order, view detail, print stickers. Verify status auto-calculation works.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/orders/ src/components/order-create-modal.tsx src/components/sticker-print.tsx
git commit -m "feat: add Orders pages with create modal, detail view, sticker printing"
```

---

## Task 10: Productie page

**Files:**
- Create: `src/app/(app)/productie/page.tsx`
- Create: `src/components/production-resolve-modal.tsx`

- [ ] **Step 1: Create productie page**

Create `src/app/(app)/productie/page.tsx`:

- Purely calculated view — no own table
- Summary cards at top:
  1. "Te produceren" (red): total shortage count
  2. "Onder minimum" (yellow): count of samples below min_stock
  3. "Openstaande orders" (green): count of orders with status ≠ 'completed'

- **Shortage calculation:**

  **Backorder shortages:**
  - Query non-completed orders → order_lines → bundles → bundle_colors
  - For each unique (quality_id, color_code_id, dimension_id): sum needed quantity
  - Query finished_stock: SUM quantity grouped by (quality_id, color_code_id, dimension_id)
  - Shortage = needed − finished (only show where shortage > 0)

  **Minimum stock shortages:**
  - Query `samples` where `min_stock > 0`
  - Query finished_stock: SUM quantity grouped by (quality_id, color_code_id, dimension_id)
  - Calculate backorders (from above) to get vrije voorraad
  - Shortage = min_stock − vrije_voorraad (only show where > 0)

- Shortage table: Staal (thumbnail + name), Kwaliteit, Nodig, Afgewerkt, Gesneden, Tekort, Reden (badge), Actie
- Reden: "Backorder" red badge or "Onder minimum" yellow badge
- Actie column: checkbox + "→ Voorraad" link
- Checkbox → opens resolve modal
- "→ Voorraad" link → navigates to `/stalen?sample=<id>` (pre-select in quick entry)
- Filters: quality dropdown, shortage type dropdown

- [ ] **Step 2: Create resolve modal**

Create `src/components/production-resolve-modal.tsx`:

- Pop-up when checkbox is clicked
- Shows: sample name, how many short
- Input: quantity produced
- Location picker: gang/rek/niveau dropdowns
- On confirm: insert into `finishing_batches` (triggers stock update)
- Props: `open`, `onOpenChange`, `sample`, `shortage`, `onResolved`

- [ ] **Step 3: Also query raw_stock for "Gesneden" column**

Add query for `raw_stock` aggregated by (quality_id, color_code_id, dimension_id) to show how many are already cut but not finished. This helps production decide what to finish next.

- [ ] **Step 4: Verify**

With test data (orders + stock), verify shortage calculations. Check off a shortage and verify stock updates.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/productie/page.tsx src/components/production-resolve-modal.tsx
git commit -m "feat: add Productie shortage overview with resolve flow"
```

---

## Task 11: Root layout cleanup & auth flow

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update root layout**

The root layout currently wraps everything in AuthProvider. Since we moved AuthProvider into the `(app)` route group layout, update root layout to only provide fonts and global styles. This is safe because the login page (`src/app/login/page.tsx`) does NOT use `useAuth()` — it only uses `createClient()` directly:

```tsx
import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", weight: ["400", "500", "600", "700"] });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], variable: "--font-dm-serif", weight: "400" });

export const metadata: Metadata = {
  title: "Karpi Staaltjesbeheer",
  description: "Intern voorraadbeheersysteem voor Karpi BV",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className={`${dmSans.variable} ${dmSerif.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify login → app flow**

1. Open `/login` → login with credentials
2. Should redirect to `/orders`
3. Sidebar should show all 5 pages
4. Logout should redirect to `/login`

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "refactor: move AuthProvider to route group, simplify root layout"
```

---

## Task 12: Update CLAUDE.md and architecture docs

**Files:**
- Modify: `karpi-sample-management/CLAUDE.md`
- Modify: `docs/architecture/frontend.md`
- Modify: `docs/architecture/database.md`

- [ ] **Step 1: Update CLAUDE.md**

Update the project structure section to reflect the new 5-page flat layout. Update the status section to mark current phase. Remove references to the old 3-section structure.

- [ ] **Step 2: Update frontend.md**

Update route structure, navigation description, and component list.

- [ ] **Step 3: Update database.md**

Add new tables (`samples`, `orders`, `order_lines`, `carpet_dimensions`, `quality_carpet_dimensions`, `client_carpet_prices`). Note deprecated tables. Update phase status.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/architecture/
git commit -m "docs: update architecture docs for simplified 5-page structure"
```

---

## Task 13: End-to-end verification

- [ ] **Step 1: Full build**

Run: `cd karpi-sample-management && npm run build`

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Test complete flow**

1. Login → lands on `/orders`
2. Navigate to `/klanten` → create a client with logo, eigen namen, prijzen
3. Navigate to `/collecties` → verify collections and bundles display correctly
4. Navigate to `/stalen` → create a sample, use quick entry to book stock
5. Navigate to `/orders` → create an order, view detail, verify status calculation
6. Print stickers from order detail
7. Navigate to `/productie` → verify shortages appear, resolve one
8. Verify old routes (`/production`, `/sales`, `/management`) still load but are not in navigation

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete simplified 5-page app restructure"
```
