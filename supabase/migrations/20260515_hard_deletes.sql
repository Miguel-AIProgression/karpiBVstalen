-- Hard deletes: verwijder alles wat als "soft deleted" (active=false) in de DB achterblijft.
-- Daarna: bundels en collecties worden altijd hard-deleted.

-- 1. bundle_id FK → SET NULL zodat bundels verwijderd kunnen worden zonder orderhistorie te breken
ALTER TABLE order_lines DROP CONSTRAINT IF EXISTS order_lines_bundle_id_fkey;
ALTER TABLE order_lines ADD CONSTRAINT order_lines_bundle_id_fkey
  FOREIGN KEY (bundle_id) REFERENCES bundles(id) ON DELETE SET NULL;

-- 2. Ruim bestaande inactieve collecties op
DELETE FROM collection_bundles
  WHERE collection_id IN (SELECT id FROM collections WHERE active = false);
DELETE FROM collections WHERE active = false;

-- 3. Ruim bestaande inactieve bundels op
DELETE FROM bundle_items  WHERE bundle_id IN (SELECT id FROM bundles WHERE active = false);
DELETE FROM bundle_colors WHERE bundle_id IN (SELECT id FROM bundles WHERE active = false);
DELETE FROM bundle_stock  WHERE bundle_id IN (SELECT id FROM bundles WHERE active = false);
DELETE FROM collection_bundles WHERE bundle_id IN (SELECT id FROM bundles WHERE active = false);
DELETE FROM bundles WHERE active = false;

-- 4. Ruim inactieve stalen op die NIET in orderregels voorkomen (veilig te verwijderen)
DELETE FROM finished_stock
  WHERE (quality_id, color_code_id, dimension_id) IN (
    SELECT quality_id, color_code_id, dimension_id FROM samples
    WHERE active = false
      AND id NOT IN (SELECT DISTINCT sample_id FROM order_lines WHERE sample_id IS NOT NULL)
  );
DELETE FROM bundle_items
  WHERE sample_id IN (
    SELECT id FROM samples
    WHERE active = false
      AND id NOT IN (SELECT DISTINCT sample_id FROM order_lines WHERE sample_id IS NOT NULL)
  );
DELETE FROM samples
  WHERE active = false
    AND id NOT IN (SELECT DISTINCT sample_id FROM order_lines WHERE sample_id IS NOT NULL);

-- 5. Ruim inactieve kwaliteiten en kleurcodes op die nergens meer aan vastzitten
DELETE FROM qualities
  WHERE active = false
    AND id NOT IN (SELECT DISTINCT quality_id FROM samples);
DELETE FROM color_codes
  WHERE active = false
    AND id NOT IN (SELECT DISTINCT color_code_id FROM samples);
