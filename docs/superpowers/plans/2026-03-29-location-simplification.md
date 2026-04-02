# Locatie-vereenvoudiging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `samples.location` the single source of truth for locations, removing all `locations` table / `raw_stock` / `bundle_stock` location reads from the UI.

**Architecture:** `samples.location` (text field, format `X-00-00`) stores location per sample type (quality+color+dimension). `finished_stock` keeps tracking quantities but its `location_id` is no longer surfaced in UI — a fixed default location is used for all writes. UI components that previously selected or displayed locations from the `locations` table now read `samples.location` instead.

**Tech Stack:** Next.js 15, TypeScript, Supabase (PostgreSQL), Tailwind CSS

---

### Task 1: SQL migration — consolidate finished_stock + update view

**Files:**
- Create: `supabase/migrations/20260329_location_simplification.sql`

This SQL file is NOT auto-applied. The client will run it manually via Supabase SQL editor.

- [ ] **Step 1: Write the migration SQL**

```sql
-- ============================================================
-- Location Simplification Migration
-- Consolidates finished_stock rows and simplifies v_pipeline_status
-- ============================================================

-- 1. Ensure a default location exists (used for all future finished_stock writes)
INSERT INTO locations (aisle, rack, level)
VALUES ('-', '-', '-')
ON CONFLICT DO NOTHING;

-- 2. Consolidate finished_stock: merge rows that differ only by location_id
--    Sum their quantities, keep the default location
DO $$
DECLARE
  default_loc_id uuid;
BEGIN
  SELECT id INTO default_loc_id FROM locations WHERE aisle = '-' AND rack = '-' AND level = '-' LIMIT 1;

  -- Insert consolidated rows at default location (for combos that don't already have a row there)
  INSERT INTO finished_stock (quality_id, color_code_id, dimension_id, finishing_type_id, location_id, quantity)
  SELECT quality_id, color_code_id, dimension_id, finishing_type_id, default_loc_id, SUM(quantity)
  FROM finished_stock
  WHERE location_id != default_loc_id
  GROUP BY quality_id, color_code_id, dimension_id, finishing_type_id
  ON CONFLICT (quality_id, color_code_id, dimension_id, finishing_type_id, location_id)
  DO UPDATE SET quantity = finished_stock.quantity + EXCLUDED.quantity;

  -- Delete non-default rows (their quantities are now merged into default)
  DELETE FROM finished_stock WHERE location_id != default_loc_id;
END $$;

-- 3. Recreate v_pipeline_status view without raw_stock, without location joins
DROP VIEW IF EXISTS v_pipeline_status;

CREATE VIEW v_pipeline_status AS
SELECT
  b.id AS bundle_id,
  b.name AS bundle_name,
  q.id AS quality_id,
  q.name AS quality_name,
  q.code AS quality_code,
  cc.id AS color_code_id,
  cc.code AS color_code,
  cc.name AS color_name,
  sd.id AS dimension_id,
  sd.name AS dimension_name,
  COALESCE(fs.total, 0) AS finished_stock_total,
  COALESCE(bs.total, 0) AS bundle_stock_total,
  s.location AS sample_location,
  (
    SELECT string_agg(DISTINCT col.name, ', ')
    FROM collection_bundles cb
    JOIN collections col ON col.id = cb.collection_id
    WHERE cb.bundle_id = b.id AND col.active = true
  ) AS collection_names
FROM bundles b
JOIN qualities q ON q.id = b.quality_id
JOIN bundle_colors bc ON bc.bundle_id = b.id
JOIN color_codes cc ON cc.id = bc.color_code_id
JOIN sample_dimensions sd ON sd.id = b.dimension_id
LEFT JOIN samples s ON s.quality_id = q.id AND s.color_code_id = cc.id AND s.dimension_id = sd.id AND s.active = true
LEFT JOIN (
  SELECT quality_id, color_code_id, dimension_id, SUM(quantity) AS total
  FROM finished_stock
  GROUP BY quality_id, color_code_id, dimension_id
) fs ON fs.quality_id = q.id AND fs.color_code_id = cc.id AND fs.dimension_id = sd.id
LEFT JOIN (
  SELECT bundle_id, SUM(quantity) AS total
  FROM bundle_stock
  GROUP BY bundle_id
) bs ON bs.bundle_id = b.id
WHERE b.active = true;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260329_location_simplification.sql
git commit -m "feat: SQL migratie voor locatie-vereenvoudiging"
```

---

### Task 2: Simplify quick-entry-modal — remove location step

**Files:**
- Modify: `src/components/quick-entry-modal.tsx`

The quick-entry modal currently has 4 steps: 1) zoek staal, 2) aantal, 3) locatie, 4) succes. We remove step 3 (locatie) and write directly to `finished_stock` instead of `finishing_batches`.

- [ ] **Step 1: Rewrite quick-entry-modal.tsx**

Remove all location-related state and UI:
- Remove `LocationOption` interface, `locations` state, `selectedAisle/Rack/Level` state, `loadLocations`, location helpers (`aisles`, `racks`, `levels`, `selectedLocation`, `previewLabel`)
- Change step type from `1 | 2 | 3 | 4` to `1 | 2 | 3` (staal → aantal → succes)
- In step 2, the "Volgende" button now calls `handleBook` directly instead of going to step 3
- Rewrite `handleBook`:
  - Resolve a default `location_id` (aisle="-", rack="-", level="-") from `locations` table
  - Resolve finishing type (keep existing logic)
  - Check if `finished_stock` row exists for this quality+color+dim+finishing+location combo
  - If exists: UPDATE quantity += amount
  - If not: INSERT new row
  - Remove `finishing_batches` insert
- Remove the entire step 3 UI block (locatie selectie)
- Rename step 4 success to step 3

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/quick-entry-modal.tsx
git commit -m "refactor: quick-entry schrijft direct naar finished_stock, locatiestap verwijderd"
```

---

### Task 3: Simplify finishing-modal — remove location field

**Files:**
- Modify: `src/components/finishing-modal.tsx`

Remove the location input field. Always use the default location (aisle="-").

- [ ] **Step 1: Rewrite finishing-modal.tsx**

Remove:
- `locationCode` state
- `parseLocationCode` helper function
- `resolveLocationId` function
- Location UI (the `<Label>Locatie</Label>` block with input)
- `locationValid` variable and its usage in disabled check

Change `handleBook`:
- Always resolve default location (aisle="-", rack="-", level="-")
- Remove location code parsing
- Keep the existing `finished_stock` check-then-update/insert logic, but always with default location

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/finishing-modal.tsx
git commit -m "refactor: finishing-modal gebruikt vaste default locatie"
```

---

### Task 4: Simplify sample-form-modal — remove stock-location breakdown

**Files:**
- Modify: `src/components/sample-form-modal.tsx`

The stock section currently shows a per-location breakdown. Simplify to show just the total and use default location for writes.

- [ ] **Step 1: Simplify stock loading and display**

In `loadStock`:
- Remove `locations(label)` join from `finished_stock` query
- Remove per-location entries building (the `StockLocationEntry` array)
- Just sum up all quantities to get total
- Remove `StockLocationEntry` interface, `stockLocations` state, `allLocations` state, `selectedLocationId` state, `primaryLocationId` state
- Keep only `stockTotal` and `originalStockTotal`

In `handleSave` stock change logic:
- When creating new finished_stock (diff > 0, no existing rows): always use default location (aisle="-")
- Remove `selectedLocationId`/`primaryLocationId` references
- Keep the existing update logic for rows that already exist

Remove the `LocationOption` interface.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/sample-form-modal.tsx
git commit -m "refactor: sample-form toont alleen totaal voorraad, geen locatie-breakdown"
```

---

### Task 5: Simplify packing-slip — only use samples.location

**Files:**
- Modify: `src/components/packing-slip.tsx`

Remove all `bundle_stock` and `finished_stock` location queries. Only use `samples.location`.

- [ ] **Step 1: Rewrite location logic in loadData**

Remove the entire block from line 105 ("Fetch bundle stock locations...") through line 191.

Replace with a simpler approach:
- For multi-quality bundles: `samples.location` is already in the query via `bundle_items(... samples(... location ...))` — extract from there
- For old-style bundles: query `samples` table by quality_id + color_code_ids + dimension_id to get location

The location logic (after the custom names block, before accessories):

```typescript
// Build location map from samples.location
const locationMap = new Map<string, string>();
const oldStyleBundles: { bundleId: string; quality_id: string; dimension_id: string; color_code_ids: string[] }[] = [];

for (const line of (order as any).order_lines ?? []) {
  const bundle = line.bundles;
  if (!bundle) continue;

  if (!bundle.quality_id && (bundle.bundle_items?.length ?? 0) > 0) {
    // Multi-quality: samples already loaded with location field
    for (const item of bundle.bundle_items ?? []) {
      const loc = item.samples?.location;
      if (loc && !locationMap.has(bundle.id)) {
        locationMap.set(bundle.id, loc);
        break;
      }
    }
  } else if (bundle.quality_id) {
    const colorIds = (bundle.bundle_colors ?? []).map((bc: any) => bc.color_code_id).filter(Boolean);
    if (colorIds.length > 0 && bundle.dimension_id) {
      oldStyleBundles.push({
        bundleId: bundle.id,
        quality_id: bundle.quality_id,
        dimension_id: bundle.dimension_id,
        color_code_ids: colorIds,
      });
    }
  }
}

// Query samples for old-style bundles
if (oldStyleBundles.length > 0) {
  const allQIds = [...new Set(oldStyleBundles.map((b) => b.quality_id))];
  const allCIds = [...new Set(oldStyleBundles.flatMap((b) => b.color_code_ids))];
  const { data: sampleData } = await supabase
    .from("samples")
    .select("quality_id, color_code_id, dimension_id, location")
    .in("quality_id", allQIds)
    .in("color_code_id", allCIds)
    .not("location", "is", null);

  const sampleLocMap = new Map<string, string>();
  for (const s of (sampleData ?? []) as any[]) {
    if (s.location) {
      sampleLocMap.set(`${s.quality_id}|${s.color_code_id}|${s.dimension_id}`, s.location);
    }
  }

  for (const b of oldStyleBundles) {
    if (locationMap.has(b.bundleId)) continue;
    for (const cid of b.color_code_ids) {
      const loc = sampleLocMap.get(`${b.quality_id}|${cid}|${b.dimension_id}`);
      if (loc) {
        locationMap.set(b.bundleId, loc);
        break;
      }
    }
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/packing-slip.tsx
git commit -m "refactor: pakbon leest locatie alleen uit samples.location"
```

---

### Task 6: Simplify pipeline-view — remove raw_stock

**Files:**
- Modify: `src/components/pipeline-view.tsx`

Remove `raw_stock` query and the "Gesneden" stage. Show only "Afgewerkt" and "Bundels".

- [ ] **Step 1: Remove raw_stock from pipeline-view**

- Remove `raw_stock` query from `loadStats`
- Remove `raw_total` from `PipelineStats` interface and state
- Remove `raw_stock` realtime subscription
- Remove the "Gesneden" entry from the `stages` array
- Keep "Afgewerkt" and "Bundels" stages only

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline-view.tsx
git commit -m "refactor: pipeline toont alleen afgewerkt + bundels, raw_stock verwijderd"
```

---

### Task 7: Simplify bundel-stock-tab — remove locations from bundle_stock

**Files:**
- Modify: `src/components/bundel-stock-tab.tsx`

Stop reading locations from `bundle_stock`. Remove location display from expanded rows.

- [ ] **Step 1: Rewrite bundel-stock-tab**

- Remove `locations` field from `BundleRow` interface
- Change `bundle_stock` query from `"bundle_id, location_id, quantity, locations(label)"` to `"bundle_id, quantity"`
- Remove location building in stockMap (just sum quantities)
- Remove the `MapPin` import
- In the expanded row, remove the entire "Locaties" section (the `<td>` with `<h4>Locaties</h4>`)
- Adjust the expanded row layout: colors span the full width

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/bundel-stock-tab.tsx
git commit -m "refactor: bundel-stock-tab zonder locatie-display uit bundle_stock"
```

---

### Task 8: Simplify collectie-stock-tab — remove locations from bundle_stock

**Files:**
- Modify: `src/components/collectie-stock-tab.tsx`

Same pattern as bundel-stock-tab.

- [ ] **Step 1: Rewrite collectie-stock-tab**

- Remove `locations` field from `BundleStockInfo` interface
- Change `bundle_stock` query to `"bundle_id, quantity"`
- Remove location building in stockMap
- Remove `MapPin` import
- In expanded bundles, remove the location display (the `{b.locations.length > 0 && ...}` block)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/collectie-stock-tab.tsx
git commit -m "refactor: collectie-stock-tab zonder locatie-display uit bundle_stock"
```

---

### Task 9: Simplify sales/delivery page — remove raw_stock columns

**Files:**
- Modify: `src/app/sales/delivery/page.tsx`

Remove `raw_stock_total`, `raw_stock_locations` from the UI. The view will no longer return these after migration.

- [ ] **Step 1: Update delivery page**

- Remove `raw_stock_total` and `raw_stock_locations` from `PipelineRow` interface
- Add `sample_location: string | null` to `PipelineRow` interface (from updated view)
- Remove the "Gesneden (locatie)" `<TableHead>` column
- Remove the `raw_stock` `<TableCell>` from the table body
- Rename "Afgewerkt (locatie)" to just "Afgewerkt"
- Remove `finished_stock_locations` from `PipelineRow` interface and from the `stockCell` call (just show the number)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/sales/delivery/page.tsx
git commit -m "refactor: delivery page zonder raw_stock kolommen"
```

---

### Task 10: Simplify stalen page — remove locations join from finished_stock

**Files:**
- Modify: `src/app/(app)/stalen/page.tsx`

The stalen page already shows `samples.location` correctly. Just clean up the `finished_stock` query.

- [ ] **Step 1: Remove locations join from finished_stock query**

- Change the `finished_stock` query from `"quality_id, color_code_id, dimension_id, location_id, quantity, locations(label)"` to `"quality_id, color_code_id, dimension_id, quantity"`
- Simplify `StockEntry` interface: remove `location_id` and `location_label` fields
- Simplify the stock aggregation: just sum quantities per quality+color+dim key (no per-location breakdown)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/stalen/page.tsx
git commit -m "refactor: stalen page finished_stock zonder locatie-join"
```

---

### Task 11: Delete unused LocationPicker component

**Files:**
- Delete: `src/components/location-picker.tsx`

- [ ] **Step 1: Delete the file**

```bash
rm src/components/location-picker.tsx
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds (component was never imported)

- [ ] **Step 3: Commit**

```bash
git add -A src/components/location-picker.tsx
git commit -m "chore: ongebruikte LocationPicker component verwijderd"
```

---

### Task 12: Update types.ts

**Files:**
- Modify: `src/lib/supabase/types.ts`

Update the `v_pipeline_status` view type to match the new view definition.

- [ ] **Step 1: Update view type**

Change `v_pipeline_status` Row type:
- Remove `raw_stock_total`, `raw_stock_locations`, `finished_stock_locations`
- Add `sample_location: string | null`
- Keep `finished_stock_total`, `bundle_stock_total`, and all other fields

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "chore: types.ts bijgewerkt voor vereenvoudigde v_pipeline_status view"
```

---

### Task 13: Final build + push

- [ ] **Step 1: Full build verification**

Run: `npm run build`
Expected: Build succeeds with 0 errors

- [ ] **Step 2: Push all changes**

```bash
git push
```

---

## Post-implementation: handmatige stappen

Na het pushen moet de klant de volgende stappen doen:

1. **SQL-migratie uitvoeren** — Open `supabase/migrations/20260329_location_simplification.sql` en voer deze uit in de Supabase SQL Editor
2. **Controleer** dat bestaande locaties uit `samples.location` nog kloppen op de Stalen-pagina
3. **Test** de pakbon van een order om te verifiëren dat de locatie getoond wordt
4. **Test** de snelle invoer — locatiestap moet weg zijn
