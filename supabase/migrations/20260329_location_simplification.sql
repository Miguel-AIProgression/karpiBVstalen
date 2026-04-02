-- ============================================================
-- Location Simplification Migration
-- Consolidates finished_stock rows and simplifies v_pipeline_status
-- Run this manually in the Supabase SQL Editor
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
