-- ============================================================
-- Order_lines: van bundle-driven naar sample-driven
-- ============================================================
-- Doel: artikel-driven orderregels (1 regel = 1 staal × aantal).
-- Bestaande bundle-regels worden geëxpandeerd: 1 regel met N kleuren
-- wordt N regels (één per sample), aantal blijft gelijk.
--
-- Run handmatig in Supabase SQL Editor of via `npx supabase db push`.
-- ============================================================

-- ─── 1. Schema: sample_id toevoegen, bundle_id en collection_id nullable ───

ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS sample_id uuid REFERENCES samples(id);
ALTER TABLE order_lines ALTER COLUMN bundle_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_lines_sample_id ON order_lines(sample_id);

-- orders.collection_id wordt optioneel: nieuwe artikel-driven orders hebben er geen
ALTER TABLE orders ALTER COLUMN collection_id DROP NOT NULL;

-- ─── 2. Backfill: oude bundles → sample-rijen ─────────────
-- A) Oude-stijl bundles (bundle_colors): join samples op (quality, color, dim)
INSERT INTO order_lines (order_id, sample_id, quantity, created_at)
SELECT
  ol.order_id,
  s.id,
  ol.quantity,
  ol.created_at
FROM order_lines ol
JOIN bundles b        ON b.id = ol.bundle_id
JOIN bundle_colors bc ON bc.bundle_id = b.id
JOIN samples s ON s.quality_id    = b.quality_id
             AND s.color_code_id = bc.color_code_id
             AND s.dimension_id  = b.dimension_id
WHERE ol.bundle_id IS NOT NULL
  AND ol.sample_id IS NULL
  AND b.quality_id IS NOT NULL
  AND b.dimension_id IS NOT NULL;

-- B) Multi-quality bundles (bundle_items): direct sample-koppeling
INSERT INTO order_lines (order_id, sample_id, quantity, created_at)
SELECT
  ol.order_id,
  bi.sample_id,
  ol.quantity,
  ol.created_at
FROM order_lines ol
JOIN bundles b      ON b.id = ol.bundle_id
JOIN bundle_items bi ON bi.bundle_id = b.id
WHERE ol.bundle_id IS NOT NULL
  AND ol.sample_id IS NULL
  AND (b.quality_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM bundle_colors WHERE bundle_id = b.id));

-- ─── 3. Verwijder de oude bundle-only rijen ───────────────
-- Alleen als hun expansie al bestaat (≥1 sample-rij voor dezelfde order is gemaakt
-- in stap 2). Voorkomt dataverlies bij bundles zonder kleuren of items.

DELETE FROM order_lines ol_old
WHERE ol_old.bundle_id IS NOT NULL
  AND ol_old.sample_id IS NULL
  AND EXISTS (
    SELECT 1 FROM order_lines ol_new
    WHERE ol_new.order_id  = ol_old.order_id
      AND ol_new.sample_id IS NOT NULL
      AND ol_new.created_at = ol_old.created_at
  );
