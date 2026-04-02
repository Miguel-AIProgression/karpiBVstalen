-- Migration: Add price_cents to bundles, sample_price_cents to collections, merge maatwerk collections
-- Date: 2026-03-26

-- 1. Add price_cents to bundles (same pattern as collections)
ALTER TABLE bundles ADD COLUMN IF NOT EXISTS price_cents integer;

-- 2. Add sample_price_cents to collections (price per individual sample)
ALTER TABLE collections ADD COLUMN IF NOT EXISTS sample_price_cents integer;

-- 3. Merge "maatwerk" collections (roede 1,2,3,4) into one "Maatwerk" collection
-- First, find if there are multiple maatwerk collections and merge their bundles
DO $$
DECLARE
  v_target_id uuid;
  v_max_pos int;
BEGIN
  -- Find or create the target "Maatwerk" collection
  SELECT id INTO v_target_id
  FROM collections
  WHERE lower(name) = 'maatwerk' AND active = true
  LIMIT 1;

  -- If no exact "Maatwerk" exists, pick the first maatwerk variant as target
  IF v_target_id IS NULL THEN
    SELECT id INTO v_target_id
    FROM collections
    WHERE lower(name) LIKE 'maatwerk%' AND active = true
    ORDER BY created_at
    LIMIT 1;
  END IF;

  -- If we found a target, merge all other maatwerk collections into it
  IF v_target_id IS NOT NULL THEN
    -- Rename target to just "Maatwerk"
    UPDATE collections SET name = 'Maatwerk' WHERE id = v_target_id;

    -- Get current max position in target
    SELECT COALESCE(MAX(position), 0) INTO v_max_pos
    FROM collection_bundles
    WHERE collection_id = v_target_id;

    -- Move bundles from other maatwerk collections to target (avoid duplicates)
    INSERT INTO collection_bundles (collection_id, bundle_id, position)
    SELECT v_target_id, cb.bundle_id, v_max_pos + ROW_NUMBER() OVER (ORDER BY cb.position)
    FROM collection_bundles cb
    JOIN collections c ON c.id = cb.collection_id
    WHERE c.id != v_target_id
      AND lower(c.name) LIKE 'maatwerk%'
      AND c.active = true
      AND cb.bundle_id NOT IN (
        SELECT bundle_id FROM collection_bundles WHERE collection_id = v_target_id
      );

    -- Deactivate the other maatwerk collections
    UPDATE collections
    SET active = false
    WHERE lower(name) LIKE 'maatwerk%'
      AND id != v_target_id
      AND active = true;
  END IF;
END $$;
