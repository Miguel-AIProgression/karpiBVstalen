# Simplified 5-Page App Design

**Date:** 2026-03-25
**Status:** Approved
**Context:** Client feedback requested simplification from multi-section app to 5 flat pages

## Overview

Restructure the Karpi sample management app from the current 3-section layout (Productie/Verkoop/Management with sub-pages) to 5 flat pages: Orders, Stalen + Voorraad, Collecties & Bundels, Productie, Klanten.

Existing batch-registration pages (snijden, afwerken, bundelen, locaties) are removed from navigation. Code remains in the codebase but routes are no longer accessible. Stock management moves to direct manipulation on the Stalen + Voorraad page.

## Approach

Clean slate navigation and page structure. Reuse existing components (tables, forms, Supabase clients, auth), but rebuild the route structure and pages from the feedback specification.

## Schema Migration Notes

### Deprecated tables (Phase 3/4 replaced by this spec)

The existing Phase 4 tables (`projects`, `bundle_requests`, `bundle_reservations`) are **replaced** by the new `orders` + `order_lines` model. These tables should be dropped after migration since no data exists in them yet.

The existing `client_retail_prices` table referenced `dimension_id` from `sample_dimensions` (sample sizes). This is replaced by `client_carpet_prices` which references `carpet_dimensions` (full-size rug sizes). The existing `client_retail_prices` table should be dropped — it contains no production data.

The existing `client_purchase_prices` and `client_product_rules` tables are not used by this spec and can remain dormant for now.

### New table: `samples`

The current data model treats a sample as an implicit composite (quality + color + dimension). This spec materializes it as a first-class entity to store photos, descriptions, and minimum stock levels:

```sql
samples (
  id uuid PK,
  quality_id uuid FK → qualities,
  color_code_id uuid FK → color_codes,
  dimension_id uuid FK → sample_dimensions,
  photo_url text,           -- Supabase Storage path
  description text,         -- e.g. "100% Polyester, visgraat motief"
  min_stock integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (quality_id, color_code_id, dimension_id)
)
```

### `collection_bundles` needs `position` column

Add `position integer DEFAULT 0` to `collection_bundles` for bundle ordering within collections.

## Navigation

Flat sidebar with 5 items, no sections or tabs:

```
/orders          → Orders
/stalen          → Stalen & Voorraad
/collecties      → Collecties & Bundels
/productie       → Productie (tekorten)
/klanten         → Klanten
```

- Icons per item for visual recognition
- User avatar + name at bottom with logout
- All users see all 5 pages (roles remain in backend for future write-permission restrictions)
- Root `/` redirects to `/orders`

## Page 1: Orders (`/orders`)

### Overview table

| Column | Source |
|--------|--------|
| Order number | Auto-generated (format: #YYYY-NNN) |
| Klant | `clients.name` with logo/initials |
| Collectie | `collections.name` |
| Levertijd | `orders.delivery_date` |
| Status | Calculated + manual |
| Print stickers | Action link |

Filters: search (client, collection), status dropdown.

### Status flow

Three statuses with automatic calculation:

1. **Klaar om te picken** (green) — all samples in the order are in stock (afgewerkt voorraad ≥ needed)
2. **Voorraad aanvullen** (yellow) — one or more samples have insufficient stock
3. **Voltooid** (gray) — manually set when order is shipped

Status is recalculated whenever stock changes. "Voltooid" is the only manually-set status.

### Order detail (`/orders/[id]`)

- Header: order number, client, collection, delivery date
- Summary cards: delivery date, number of bundles, total samples
- Status selector (dropdown to change status)
- Bundle table: each bundle in the order with quality, number of colors, stock status
- "Print alle stickers" button — generates printable stickers for all samples in the order

### Order creation

4-step flow via modal or inline form:

1. Select client (searchable dropdown from `clients`)
2. Select collection (from `collections`)
3. Set delivery date + optional notes
4. Confirm — status is automatically calculated

### Database

```sql
-- New table
orders (
  id uuid PK,
  order_number text UNIQUE,  -- auto-generated #YYYY-NNN
  client_id uuid FK → clients,
  collection_id uuid FK → collections,
  delivery_date date,
  status text CHECK (status IN ('picking_ready', 'restock_needed', 'completed')),
  notes text,
  created_by uuid FK → auth.users,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)

-- New table
order_lines (
  id uuid PK,
  order_id uuid FK → orders,
  bundle_id uuid FK → bundles,
  quantity integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
)
```

Status is stored but recalculated via trigger/view whenever stock changes. Only `completed` is a pure manual override.

**Order number generation:** Uses a Postgres sequence per year. A database function `generate_order_number()` returns `#YYYY-NNN` format using `nextval()`.

### Order status calculation path

An order's status is derived by checking stock for every sample needed:

```
order → order_lines → bundles → bundle_colors
  For each (quality_id, color_code_id, dimension_id) combination:
    SUM finished_stock.quantity (across all finishing types and locations) >= needed quantity?
```

`finishing_type_id` is **summed across all types** — any finished stock counts as available regardless of finishing method. This simplifies the model since the sticker/order level doesn't care about finishing type.

If ALL samples have sufficient finished stock → `picking_ready`.
If ANY sample is short → `restock_needed`.
If manually set → `completed` (overrides calculation).

## Page 2: Stalen + Voorraad (`/stalen`)

### Overview table

| Column | Source |
|--------|--------|
| Staal | Thumbnail + name (quality + color) |
| Kwaliteit | `qualities.name` |
| Kleur | `color_codes.name` |
| Afmeting | `sample_dimensions` (width × height cm) |
| ✂️ Gesneden | SUM `raw_stock.quantity` grouped by quality+color+dimension (cut but not yet finished) |
| ✅ Afgewerkt | SUM `finished_stock.quantity` grouped by quality+color+dimension (across all finishing types) |
| Backorders | Calculated: SUM of samples needed in orders with status ≠ 'completed', via `order_lines → bundles → bundle_colors` |
| Vrij | Afgewerkt − Backorders |
| Min. | `samples.min_stock` — configurable per sample |

No "afwerking" column in the overview.

Filters: search, quality dropdown, dimension dropdown.

### Visual signals

- Row background red: vrije voorraad < 0 (negative)
- Row background yellow: vrije voorraad ≤ minimum
- Warning icon on Min. column when at threshold

### Expandable location details

Click a row to expand and see where stock is located:

- **Gesneden** section: list of locations (gang/rek/niveau) with quantities
- **Afgewerkt** section: list of locations with quantities

Location format: `A2-R3-L1` (Gang A, Rek 2, Niveau 1) — using existing `locations` table.

### Stock flow rules

When stock moves between stages, quantities update accordingly:
- **New cut stock**: gesneden count increases
- **Gesneden → Afgewerkt**: gesneden decreases, afgewerkt increases
- **Into bundle**: vrije voorraad on product level decreases
- All handled by database triggers (existing pattern)

### Quick entry (⚡ Snelle invoer)

3-step flow for production workers to quickly book stock:

1. **Search sample** — type quality or color, select from autocomplete results
2. **Quantity + Status** — enter count, choose "Gesneden" or "Afgewerkt"
3. **Location** — select gang/rek/niveau where placed → Book

After booking: success confirmation + "Volgende boeken" button for rapid sequential entry.

**Audit trail:** Quick entry creates batch records (`cut_batches` for gesneden, `finishing_batches` for afgewerkt) which trigger stock updates via existing database triggers. This preserves the audit trail — stock is never modified directly, always through batches.

### CRUD

- Create new sample: quality, color, dimension, photo (Supabase Storage), description
- Edit: update details, adjust stock manually via +/− controls, set minimum stock
- Delete: soft-delete (existing `active` pattern)

## Page 3: Collecties & Bundels (`/collecties`)

Two tabs on one page: **Collecties** and **Bundels**.

### Collecties tab

Expandable list of collections:

- Collection name + bundle count badge
- Expand to see bundels in order (with position numbers)
- Drag-and-drop or arrow buttons to reorder bundles within a collection
- Add/remove bundles from collection
- Create, edit, delete collections

### Bundels tab

Expandable list of all bundles:

- Bundle name + quality + dimension + color count
- Expand to see colors as pills (with color swatches)
- Shows which collections use this bundle
- Create, edit, delete bundles

### Data model

Uses existing tables: `bundles`, `bundle_colors`, `collections`, `collection_bundles`. One schema change: add `position integer DEFAULT 0` to `collection_bundles` for bundle ordering within collections.

## Page 4: Productie (`/productie`)

Purely calculated view — no own data, derived from orders + stock + minimum settings.

### Summary cards

- **Te produceren**: total samples short across all products
- **Onder minimum**: count of products below minimum threshold
- **Openstaande orders**: count of orders not completed

### Shortage table

| Column | Description |
|--------|-------------|
| Staal | Thumbnail + quality + color + dimension |
| Kwaliteit | Quality name |
| Nodig | Required count (from orders or minimum) |
| Afgewerkt | Current finished stock |
| Gesneden | Current cut stock |
| Tekort | Nodig − Afgewerkt (only shown when > 0) |
| Reden | "Backorder" (red) or "Onder minimum" (yellow) |
| Actie | Checkbox to mark done, or "→ Voorraad" link |

Two types of shortage:

1. **Backorder tekort** (red): samples needed for open orders minus finished stock
2. **Onder minimum** (yellow): minimum stock threshold minus free stock

### Resolving shortages

Two options (both update the same stock):

**Option A — Check off from production list:**
1. Check the checkbox
2. Pop-up asks quantity produced and location
3. Stock is automatically increased
4. Row disappears from production list

**Option B — Via Stalen + Voorraad:**
1. Click "→ Voorraad" link
2. Redirected to Stalen + Voorraad page (with sample pre-selected)
3. Use quick entry to book stock
4. Shortage automatically disappears

### Filters

- Quality dropdown
- Shortage type (backorder / below minimum / all)

## Page 5: Klanten (`/klanten`)

### Overview table

| Column | Source |
|--------|--------|
| Klant | Logo/initials + name |
| Klantnr. | `clients.client_number` |
| Type | Hoofdkantoor / Filiaal |
| Eigen namen | Count of configured names / "Niet ingesteld" |
| Prijzen | "Ingesteld" / "Gedeeltelijk" / "Niet ingesteld" |
| Orders | Count of orders for this client |

### Client detail (`/klanten/[id]`)

Header with logo upload (Supabase Storage), name, client number, type, email.

Three tabs:

#### Tab 1: Eigen namen

Table mapping Karpi quality names → client-specific names.
Uses existing `client_quality_names` table — data already present from TKA013 import.

- Karpi naam → Klant naam
- Add, edit, delete mappings

#### Tab 2: Prijzen

Per-quality pricing for carpet dimensions (NOT sample dimensions):

- Dropdown to select quality (shows both Karpi name and client name)
- Price table: carpet dimensions × price per piece (incl. BTW)
- "Afwijkende maten" row with price per m²
- **Adviesprijs calculator**: input purchase price (excl. BTW), select factor (×2.5 or ×3.0), auto-calculates retail price incl. 21% BTW, rounded to €X9 pattern (129, 159, 399, etc.)

Requires new entities:

```sql
-- Carpet dimensions (full-size rug sizes, NOT sample sizes)
carpet_dimensions (
  id uuid PK,
  width_cm integer,
  height_cm integer,
  name text,  -- e.g. "080×150"
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
)

-- Which carpet dimensions are available per quality
quality_carpet_dimensions (
  id uuid PK,
  quality_id uuid FK → qualities,
  carpet_dimension_id uuid FK → carpet_dimensions,
  active boolean DEFAULT true
)

-- Client retail prices per quality per carpet dimension
client_carpet_prices (
  id uuid PK,
  client_id uuid FK → clients,
  quality_id uuid FK → qualities,
  carpet_dimension_id uuid FK → carpet_dimensions,  -- NULL for "afwijkende maten"
  price_cents integer,  -- price in cents incl. BTW
  unit text CHECK (unit IN ('piece', 'm2')) DEFAULT 'piece',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (client_id, quality_id, carpet_dimension_id)
)
```

#### Tab 3: Orders

List of all orders for this client (links to order detail page).

## Sticker System

### Layout

Based on the physical sticker format provided:

```
┌─────────────────────────┐
│      [CLIENT LOGO]      │
│                         │
│  QUALITY NAME (client)  │
│  Kleur XX               │
│  100% Polyester         │
│                         │
│  080×150    € 129,00/St.│
│  130×190    € 255,00/St.│
│  160×230    € 369,00/St.│
│  200×290    € 579,00/St.│
│  240×330    € 789,00/St.│
│  Afw. maten € 129,00/m²│
│                         │
│  [disclaimer text]      │
└─────────────────────────┘
```

### Variable fields (from database)

| Field | Source |
|-------|--------|
| Logo | `clients` → Supabase Storage |
| Quality name | `client_quality_names.custom_name` (falls back to `qualities.name`) |
| Color | `color_codes.name` |
| Material | `qualities.material_type` (e.g. "100% Polyester") |
| Dimensions + prices | `client_carpet_prices` joined with `carpet_dimensions` |
| Disclaimer | Standard text (configurable later) |

### Print flow

From order detail page → "Print alle stickers":
1. System generates one sticker per sample in the order
2. Each sticker uses the client's logo, names, and prices
3. Rendered as printable HTML/CSS (browser print dialog)
4. Future: API integration with label printer

## Auth & Roles

- All users see all 5 pages (no route restrictions for now)
- Roles remain in backend (`production`, `sales`, `admin` in JWT)
- Future: write permissions per role (e.g., sales can only modify orders and clients, production can only modify stock)
- RLS policies remain active for row-level security

## Removed Pages

The following routes are removed from navigation but code stays in codebase:

- `/production` (old pipeline overview)
- `/production/cut`, `/production/finishing`, `/production/bundles`
- `/production/locations`
- `/sales`, `/sales/clients`, `/sales/projects`, `/sales/requests`, `/sales/availability`, `/sales/delivery`
- `/management`, `/management/compose`

## Technical Notes

- Database triggers handle stock movement (not application logic) — existing pattern
- All UI text in Dutch
- shadcn/ui v4 with @base-ui/react (not Radix)
- Supabase Storage for client logos and sample photos
- Soft-delete pattern (`active` boolean) for all entities
- Realtime updates via Supabase channels where applicable
