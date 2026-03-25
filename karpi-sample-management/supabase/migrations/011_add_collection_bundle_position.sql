ALTER TABLE collection_bundles ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY collection_id ORDER BY id) - 1 AS pos
  FROM collection_bundles
)
UPDATE collection_bundles cb SET position = n.pos FROM numbered n WHERE cb.id = n.id;
