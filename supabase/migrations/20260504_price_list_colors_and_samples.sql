-- ============================================================
-- Prijslijst-uitbreiding: kleur-whitelist + staaltjes-prijzen
-- ============================================================
-- Achtergrond:
--   Een prijslijst heeft tot nu toe alleen carpet-prijzen
--   (kwaliteit × afmeting × prijs). De realiteit vraagt twee
--   extra dingen op (prijslijst × kwaliteit) niveau:
--
--   1. Welke kleurnummers van die kwaliteit komen in deze lijst
--      voor (whitelist) — bestuurt welke staaltjes klanten op
--      deze prijslijst kunnen krijgen.
--
--   2. Welke prijs Karpi rekent voor het staaltje zelf
--      (factuurpost — komt NIET op de sticker).
--
--   Beide leven op (price_list_nr, quality_id) niveau, niet per
--   klant. Klanten op dezelfde lijst delen dus dezelfde set.
-- ============================================================

-- ─── 1. price_list_colors ─────────────────────────────────
-- Whitelist van kleurnummers per (prijslijst, kwaliteit).

CREATE TABLE IF NOT EXISTS price_list_colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_nr text NOT NULL REFERENCES price_lists(nr) ON DELETE CASCADE,
  quality_id    uuid NOT NULL REFERENCES qualities(id)    ON DELETE CASCADE,
  color_code_id uuid NOT NULL REFERENCES color_codes(id)  ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (price_list_nr, quality_id, color_code_id)
);

CREATE INDEX IF NOT EXISTS price_list_colors_lookup
  ON price_list_colors (price_list_nr, quality_id);

-- ─── 2. price_list_sample_prices ──────────────────────────
-- Eén staaltjes-prijs per (prijslijst, kwaliteit). Komt op factuur,
-- NIET op de sticker. price_cents = 0 betekent "nog niet ingevuld".

CREATE TABLE IF NOT EXISTS price_list_sample_prices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_nr text NOT NULL REFERENCES price_lists(nr) ON DELETE CASCADE,
  quality_id    uuid NOT NULL REFERENCES qualities(id)    ON DELETE CASCADE,
  price_cents   integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (price_list_nr, quality_id)
);

CREATE OR REPLACE FUNCTION set_updated_at_price_list_sample_prices()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_price_list_sample_prices_updated_at
  ON price_list_sample_prices;

CREATE TRIGGER trg_price_list_sample_prices_updated_at
  BEFORE UPDATE ON price_list_sample_prices
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_price_list_sample_prices();

-- ─── 3. RLS (open voor authenticated, conform andere prijs-tabellen) ──

ALTER TABLE price_list_colors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_sample_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_price_list_colors"        ON price_list_colors;
DROP POLICY IF EXISTS "auth_all_price_list_sample_prices" ON price_list_sample_prices;

CREATE POLICY "auth_all_price_list_colors"
  ON price_list_colors
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_price_list_sample_prices"
  ON price_list_sample_prices
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
