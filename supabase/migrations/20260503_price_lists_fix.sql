-- ============================================================
-- Fix: KARPI-prefix eruit + originele prijzen migreren via dim-match
-- ============================================================
-- Volgt op `20260503_price_lists.sql`. Voert twee correcties door:
--   1. KARPI-prefix uit samples.article_number en price_list_lines.article_number.
--   2. price_list_lines.price_cents = 0 (ongematchte) opnieuw vullen via
--      width_cm × height_cm match in plaats van naam-match.
--
-- Run handmatig in Supabase SQL Editor of via `npx supabase db push`.
-- ============================================================

-- ─── 1. Strip KARPI- prefix ───────────────────────────────

-- Constraint tijdelijk opheffen zodat updates niet falen op uniekheid-conflicten
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_article_number_unique;

UPDATE samples
SET article_number = REGEXP_REPLACE(article_number, '^KARPI-', '')
WHERE article_number LIKE 'KARPI-%';

UPDATE price_list_lines
SET article_number = REGEXP_REPLACE(article_number, '^KARPI-', '')
WHERE article_number LIKE 'KARPI-%';

-- Constraint herstellen
ALTER TABLE samples ADD CONSTRAINT samples_article_number_unique UNIQUE (article_number);

-- ─── 2. Vul prijzen via width_cm × height_cm match ────────
-- Stap A: directe afmeting-match (sample_dimensions.width × height
--         == carpet_dimensions.width × height)

WITH best_match AS (
  SELECT
    s.article_number,
    qbp.price_cents
  FROM samples s
  JOIN sample_dimensions sd ON sd.id = s.dimension_id
  JOIN quality_base_prices qbp ON qbp.quality_id = s.quality_id
  JOIN carpet_dimensions cd ON cd.id = qbp.carpet_dimension_id
  WHERE qbp.price_cents > 0
    AND cd.width_cm  = sd.width_cm
    AND cd.height_cm = sd.height_cm
)
UPDATE price_list_lines pll
SET price_cents = bm.price_cents
FROM best_match bm
WHERE pll.article_number = bm.article_number
  AND pll.price_list_nr  = '001'
  AND pll.price_cents    = 0;

-- Stap B: voor wat nog 0 is, fallback op laagste niet-nul-prijs voor die kwaliteit

WITH fallback_match AS (
  SELECT DISTINCT ON (s.article_number)
    s.article_number,
    qbp.price_cents
  FROM samples s
  JOIN quality_base_prices qbp ON qbp.quality_id = s.quality_id
  WHERE qbp.price_cents > 0
  ORDER BY s.article_number, qbp.price_cents ASC
)
UPDATE price_list_lines pll
SET price_cents = fm.price_cents
FROM fallback_match fm
WHERE pll.article_number = fm.article_number
  AND pll.price_list_nr  = '001'
  AND pll.price_cents    = 0;
