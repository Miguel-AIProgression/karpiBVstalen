-- ============================================================
-- Plak dit in Supabase Dashboard → SQL Editor → Run
-- ============================================================
-- 1) v3 schema: voegt `unit` kolom toe + maakt carpet_dimension_id nullable
-- 2) 26 m²-prijzen (maatwerk) voor prijslijst 0210
-- ============================================================

-- ─── Stap 1: schema v3 ────────────────────────────────────
ALTER TABLE price_list_lines
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'piece'
    CHECK (unit IN ('piece','m2'));

ALTER TABLE price_list_lines
  ALTER COLUMN carpet_dimension_id DROP NOT NULL;

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

ALTER TABLE price_list_lines
  DROP CONSTRAINT IF EXISTS price_list_lines_piece_has_dim;
ALTER TABLE price_list_lines
  ADD CONSTRAINT price_list_lines_piece_has_dim
    CHECK (
      (unit = 'piece' AND carpet_dimension_id IS NOT NULL)
      OR (unit = 'm2' AND carpet_dimension_id IS NULL)
    );

-- ─── Stap 2: backfill m² voor bestaande 001 / 0150 / 0151 ──
INSERT INTO price_list_lines (price_list_nr, quality_id, carpet_dimension_id, price_cents, unit)
SELECT pl.nr, qbp.quality_id, NULL, qbp.price_cents, 'm2'
FROM   quality_base_prices qbp
CROSS JOIN (VALUES ('001'), ('0150'), ('0151')) AS pl(nr)
WHERE  qbp.unit = 'm2'
  AND  qbp.carpet_dimension_id IS NULL
  AND  qbp.price_cents > 0
ON CONFLICT DO NOTHING;

-- ─── Stap 3: 26 m²-prijzen voor 0210 ──────────────────────
INSERT INTO price_list_lines (price_list_nr, quality_id, carpet_dimension_id, price_cents, unit)
SELECT '0210', q.id, NULL, v.price_cents, 'm2'
FROM (VALUES
  ('BEAC', 15200),
  ('BERM', 6200),
  ('BILA', 5300),
  ('BIRM', 5300),
  ('BREE', 3200),
  ('CACH', 8900),
  ('CISC', 5300),
  ('DANT', 7900),
  ('EMIR', 5200),
  ('GALA', 6700),
  ('GENT', 8700),
  ('GOLD', 4100),
  ('HARM', 3600),
  ('LAGO', 5800),
  ('LAMI', 5800),
  ('LOOP', 5900),
  ('LORA', 4400),
  ('LOUV', 3900),
  ('LUXR', 5400),
  ('MARI', 9200),
  ('ROYL', 15800),
  ('RUBI', 5400),
  ('SEAO', 3200),
  ('SETI', 5100),
  ('SOLE', 3600),
  ('SPLE', 11100)
) AS v(quality_code, price_cents)
JOIN qualities q ON q.code = v.quality_code
ON CONFLICT DO NOTHING;

-- ─── Verify ───────────────────────────────────────────────
SELECT price_list_nr, unit, COUNT(*) AS aantal
FROM price_list_lines
WHERE price_list_nr IN ('0150','0151','0210')
GROUP BY price_list_nr, unit
ORDER BY price_list_nr, unit;
