-- ============================================================
-- Prijslijsten + Artikelnummers — Schema + Backfill
-- ============================================================
-- Doel: ERP-stijl prijslijsten met artikel-driven prijzen.
--   - price_lists: header (nr, naam, geldig_vanaf, actief)
--   - price_list_lines: regels (price_list_nr + article_number → price_cents)
--   - samples.article_number: stabiele sleutel per staal
--   - clients.price_list_nr: één prijslijst per klant (FK)
--
-- Run handmatig in Supabase SQL Editor of via `npx supabase db push`.
-- ============================================================

-- ─── 1. Tabellen ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_lists (
  nr          text PRIMARY KEY,
  name        text NOT NULL,
  valid_from  date NOT NULL DEFAULT CURRENT_DATE,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_list_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_nr   text NOT NULL REFERENCES price_lists(nr) ON DELETE CASCADE,
  article_number  text NOT NULL,
  price_cents     integer NOT NULL DEFAULT 0,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (price_list_nr, article_number)
);

CREATE INDEX IF NOT EXISTS idx_price_list_lines_article ON price_list_lines(article_number);
CREATE INDEX IF NOT EXISTS idx_price_list_lines_pl     ON price_list_lines(price_list_nr);

-- ─── 2. Kolommen op bestaande tabellen ────────────────────

ALTER TABLE samples ADD COLUMN IF NOT EXISTS article_number text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS price_list_nr  text REFERENCES price_lists(nr);
CREATE INDEX IF NOT EXISTS idx_clients_price_list_nr ON clients(price_list_nr);

-- ─── 3. updated_at trigger (idempotent) ───────────────────

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS price_lists_updated_at      ON price_lists;
DROP TRIGGER IF EXISTS price_list_lines_updated_at ON price_list_lines;

CREATE TRIGGER price_lists_updated_at      BEFORE UPDATE ON price_lists      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER price_list_lines_updated_at BEFORE UPDATE ON price_list_lines FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 4. RLS ───────────────────────────────────────────────
-- Authenticated lezen + schrijven (rolcheck gebeurt in UI; pas later aan
-- naar admin-only writes als de rest van het schema dat consequent doet).

ALTER TABLE price_lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_lists_authenticated_all      ON price_lists;
DROP POLICY IF EXISTS price_list_lines_authenticated_all ON price_list_lines;

CREATE POLICY price_lists_authenticated_all      ON price_lists      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY price_list_lines_authenticated_all ON price_list_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 5. Backfill samples.article_number ───────────────────
-- Format: {QUALITY_CODE}-{COLOR_CODE}-{DIM_SHORT}
--   bijv. AEST-13-30X50

UPDATE samples s
SET article_number = q.code || '-' || cc.code || '-' || UPPER(REPLACE(sd.name, ' ', ''))
FROM qualities q, color_codes cc, sample_dimensions sd
WHERE s.quality_id     = q.id
  AND s.color_code_id  = cc.id
  AND s.dimension_id   = sd.id
  AND s.article_number IS NULL;

-- Als er duplicates zouden zijn (zelfde quality+color+dim), de migratie faalt op de UNIQUE.
-- In dat geval eerst data opschonen.
ALTER TABLE samples ALTER COLUMN article_number SET NOT NULL;
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_article_number_unique;
ALTER TABLE samples ADD  CONSTRAINT samples_article_number_unique UNIQUE (article_number);
CREATE INDEX IF NOT EXISTS idx_samples_article_number ON samples(article_number);

-- ─── 6. Standaard-prijslijst aanmaken ─────────────────────

INSERT INTO price_lists (nr, name, valid_from, active)
VALUES ('001', 'Standaard 2026', CURRENT_DATE, true)
ON CONFLICT (nr) DO NOTHING;

-- ─── 7. Vul standaard-prijslijst met regels per staal ─────
-- Prijs uit quality_base_prices via width_cm × height_cm match
-- (sample_dimensions en carpet_dimensions hebben beide deze kolommen).
-- Fallback: laagste niet-nul-prijs voor die kwaliteit. Geen match → 0.

INSERT INTO price_list_lines (price_list_nr, article_number, price_cents, description)
SELECT
  '001' AS price_list_nr,
  s.article_number,
  COALESCE(
    (
      -- Stap A: directe afmeting-match
      SELECT qbp.price_cents
      FROM quality_base_prices qbp
      JOIN carpet_dimensions cd ON cd.id = qbp.carpet_dimension_id
      WHERE qbp.quality_id = s.quality_id
        AND qbp.price_cents > 0
        AND cd.width_cm  = sd.width_cm
        AND cd.height_cm = sd.height_cm
      LIMIT 1
    ),
    (
      -- Stap B: fallback: laagste niet-nul-prijs voor die kwaliteit
      SELECT MIN(qbp.price_cents)
      FROM quality_base_prices qbp
      WHERE qbp.quality_id = s.quality_id
        AND qbp.price_cents > 0
    ),
    0
  ) AS price_cents,
  q.name || ' ' || cc.name || ' ' || sd.name AS description
FROM samples s
JOIN qualities         q  ON q.id  = s.quality_id
JOIN color_codes       cc ON cc.id = s.color_code_id
JOIN sample_dimensions sd ON sd.id = s.dimension_id
WHERE s.active = true
ON CONFLICT (price_list_nr, article_number) DO NOTHING;

-- ─── 8. Default klanten op '001' ──────────────────────────

UPDATE clients SET price_list_nr = '001' WHERE price_list_nr IS NULL;
