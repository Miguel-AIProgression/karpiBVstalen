-- ============================================================
-- Prijslijsten v3 — m²-prijzen voor maatwerk
-- ============================================================
-- Achtergrond:
-- v2 sloeg `quality_base_prices` met `carpet_dimension_id IS NULL`
-- (de m²-prijzen voor maatwerk) over. Stickers tonen daardoor geen
-- maatwerk-prijs.
--
-- v3 voegt aan `price_list_lines` een `unit` toe ('piece' of 'm2').
-- m²-rijen hebben `carpet_dimension_id = NULL`. UNIQUE wordt gesplitst
-- in twee partial indexen.
-- ============================================================

-- ─── 1. Schema ────────────────────────────────────────────

ALTER TABLE price_list_lines
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'piece'
    CHECK (unit IN ('piece','m2'));

ALTER TABLE price_list_lines
  ALTER COLUMN carpet_dimension_id DROP NOT NULL;

-- Oude UNIQUE constraint vervangen door 2 partial indexen
ALTER TABLE price_list_lines
  DROP CONSTRAINT IF EXISTS price_list_lines_price_list_nr_quality_id_carpet_dimension_key;

DROP INDEX IF EXISTS price_list_lines_piece_unique;
DROP INDEX IF EXISTS price_list_lines_m2_unique;

CREATE UNIQUE INDEX price_list_lines_piece_unique
  ON price_list_lines (price_list_nr, quality_id, carpet_dimension_id)
  WHERE unit = 'piece';

CREATE UNIQUE INDEX price_list_lines_m2_unique
  ON price_list_lines (price_list_nr, quality_id)
  WHERE unit = 'm2';

-- Sanity: piece-rijen MOETEN een carpet_dimension_id hebben
ALTER TABLE price_list_lines
  DROP CONSTRAINT IF EXISTS price_list_lines_piece_has_dim;
ALTER TABLE price_list_lines
  ADD CONSTRAINT price_list_lines_piece_has_dim
    CHECK (
      (unit = 'piece' AND carpet_dimension_id IS NOT NULL)
      OR (unit = 'm2' AND carpet_dimension_id IS NULL)
    );

-- ─── 2. Backfill m²-prijzen voor 001 / 0150 / 0151 ────────

INSERT INTO price_list_lines (price_list_nr, quality_id, carpet_dimension_id, price_cents, unit)
SELECT pl.nr, qbp.quality_id, NULL, qbp.price_cents, 'm2'
FROM   quality_base_prices qbp
CROSS JOIN (VALUES ('001'), ('0150'), ('0151')) AS pl(nr)
WHERE  qbp.unit = 'm2'
  AND  qbp.carpet_dimension_id IS NULL
  AND  qbp.price_cents > 0
ON CONFLICT DO NOTHING;
