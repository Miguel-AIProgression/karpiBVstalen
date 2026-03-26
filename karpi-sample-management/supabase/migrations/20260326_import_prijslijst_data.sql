-- ════════════════════════════════════════════════════════════════
-- Migration: Import prijslijst — INKOOPPRIJZEN
-- Bron: Voorbeeld verkoopprijslijst 2.5.xls (BENELUX, 16.03.2026)
--
-- De prijzen in het Excel-bestand zijn VERKOOPPRIJZEN berekend als:
--   Verkoopprijs = Inkoopprijs × 2.5 × 1.21
-- Wij slaan de INKOOPPRIJZEN op:
--   Inkoopprijs = Verkoopprijs / 3.025
--
-- Bij een order wordt de verkoopprijs berekend als:
--   Verkoopprijs = Inkoopprijs × factor × 1.21
-- Waarbij factor per klant instelbaar is (2.3, 2.5, 3.0, etc.)
-- ════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- STAP 1: Uniek constraint op carpet_dimensions.name
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'carpet_dimensions_name_key'
  ) THEN
    ALTER TABLE carpet_dimensions ADD CONSTRAINT carpet_dimensions_name_key UNIQUE (name);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- STAP 2: Alle afmetingen uit de prijslijst toevoegen
-- ═══════════════════════════════════════════════════════════════
INSERT INTO carpet_dimensions (width_cm, height_cm, name) VALUES
  -- Rechthoekig
  (60,  90,  '060x090'),
  (60,  133, '060x133'),
  (68,  120, '068x120'),
  (68,  220, '068x220'),
  (70,  140, '070x140'),
  (80,  150, '080x150'),
  (80,  200, '080x200'),
  (80,  300, '080x300'),
  (90,  160, '090x160'),
  (120, 170, '120x170'),
  (120, 180, '120x180'),
  (130, 190, '130x190'),
  (135, 200, '135x200'),
  (140, 180, '140x180'),
  (140, 200, '140x200'),
  (155, 230, '155x230'),
  (160, 230, '160x230'),
  (160, 240, '160x240'),
  (180, 250, '180x250'),
  (200, 200, '200x200'),
  (200, 240, '200x240'),
  (200, 250, '200x250'),
  (200, 290, '200x290'),
  (240, 290, '240x290'),
  (240, 330, '240x330'),
  (240, 340, '240x340'),
  (250, 350, '250x350'),
  (300, 400, '300x400'),
  (400, 400, '400x400'),
  (400, 600, '400x600'),
  -- Rond (diameter × diameter)
  (80,  80,  '080 ROND'),
  (100, 100, '100 ROND'),
  (120, 120, '120 ROND'),
  (160, 160, '160 ROND'),
  (200, 200, '200 ROND'),
  (220, 220, '220 ROND'),
  (240, 240, '240 ROND'),
  (250, 250, '250 ROND'),
  (280, 280, '280 ROND'),
  (300, 300, '300 ROND')
ON CONFLICT (name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- STAP 3: Kwaliteiten aanmaken die nog niet bestaan
-- ═══════════════════════════════════════════════════════════════
INSERT INTO qualities (name, code, active)
SELECT v.name, v.code, true
FROM (VALUES
  ('LORANDA',    'LORANDA'),
  ('BILAL',      'BILAL'),
  ('SEASON',     'SEASON'),
  ('BIRMA',      'BIRMA'),
  ('HARMONY',    'HARMONY'),
  ('DANTE',      'DANTE'),
  ('TAMARA',     'TAMARA'),
  ('BREEZE',     'BREEZE'),
  ('SISAL GOLD', 'SISAL GOLD'),
  ('BERMUDA',    'BERMUDA'),
  ('SETI',       'SETI'),
  ('SISAL LOOP', 'SISAL LOOP'),
  ('SPLENDID',   'SPLENDID'),
  ('FINESSE',    'FINESSE'),
  ('OLIMPOS',    'OLIMPOS'),
  ('LUXURY',     'LUXURY'),
  ('MARICH',     'MARICH'),
  ('SOLEIL',     'SOLEIL'),
  ('ECLAT',      'ECLAT'),
  ('LIGNE',      'LIGNE'),
  ('TIFFANY',    'TIFFANY'),
  ('GALAXY',     'GALAXY'),
  ('CURLY',      'CURLY'),
  ('PABLO',      'PABLO'),
  ('EMIR',       'EMIR'),
  ('MARRAKE',    'MARRAKE'),
  ('RUBI',       'RUBI'),
  ('CHAIN',      'CHAIN'),
  ('MODRA',      'MODRA'),
  ('CAS',        'CAS'),
  ('BABYLON',    'BABYLON'),
  ('ZEN',        'ZEN'),
  ('LOUVRE',     'LOUVRE'),
  ('GENTLE',     'GENTLE'),
  ('CACHET',     'CACHET'),
  ('ROYALE',     'ROYALE'),
  ('LAGO',       'LAGO'),
  ('LAGO MIX',   'LAGO MIX'),
  ('OMBRE',      'OMBRE'),
  ('CISCO',      'CISCO'),
  ('PLUSH',      'PLUSH'),
  ('BEACH LIFE', 'BEACH LIFE'),
  ('GALA',       'GALA'),
  ('LAMI',       'LAMI')
) AS v(name, code)
WHERE NOT EXISTS (
  SELECT 1 FROM qualities q
  WHERE UPPER(q.name) = UPPER(v.name) OR UPPER(q.code) = UPPER(v.code)
);

-- ═══════════════════════════════════════════════════════════════
-- STAP 4: Inkoopprijzen importeren via tijdelijke tabel
--
-- Alle bedragen hieronder zijn VERKOOPPRIJZEN uit het Excel-bestand.
-- Ze worden omgerekend naar INKOOPPRIJZEN: / 3.025 × 100 = centen.
--
-- unit = 'piece' → inkoopprijs per stuk (vaste maat)
-- unit = 'm2'    → inkoopprijs per m² (maatwerk, alleen als het
--                   in het Excel-bestand als regel bij de kwaliteit staat)
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  r RECORD;
BEGIN
  CREATE TEMP TABLE _prijslijst (
    quality_name TEXT,
    dim_name     TEXT,  -- NULL = maatwerk per m²
    vk_euros     NUMERIC, -- verkoopprijs uit Excel
    unit         TEXT     -- 'piece' of 'm2'
  ) ON COMMIT DROP;

  INSERT INTO _prijslijst (quality_name, dim_name, vk_euros, unit) VALUES
    -- ── LORANDA ──
    ('LORANDA', '160x230', 319, 'piece'),
    ('LORANDA', '200x290', 485, 'piece'),
    ('LORANDA', NULL, 109, 'm2'),

    -- ── BILAL ──
    ('BILAL', '160x230', 389, 'piece'),
    ('BILAL', '200x290', 609, 'piece'),
    ('BILAL', NULL, 135, 'm2'),

    -- ── SEASON (OUTDOOR) ──
    ('SEASON', '160x230', 235, 'piece'),
    ('SEASON', '200x290', 365, 'piece'),
    ('SEASON', NULL, 79, 'm2'),

    -- ── BIRMA ──
    ('BIRMA', '160x230', 385, 'piece'),
    ('BIRMA', '200x290', 609, 'piece'),
    ('BIRMA', NULL, 135, 'm2'),

    -- ── HARMONY ──
    ('HARMONY', '130x190', 175, 'piece'),
    ('HARMONY', '160 ROND', 195, 'piece'),
    ('HARMONY', '160x230', 259, 'piece'),
    ('HARMONY', '200 ROND', 305, 'piece'),
    ('HARMONY', '200x290', 409, 'piece'),
    ('HARMONY', NULL, 89, 'm2'),

    -- ── DANTE (alleen maatwerk) ──
    ('DANTE', NULL, 199, 'm2'),

    -- ── TAMARA (alleen maatwerk) ──
    ('TAMARA', NULL, 89, 'm2'),

    -- ── BREEZE ──
    ('BREEZE', '160x230', 235, 'piece'),
    ('BREEZE', '200x290', 365, 'piece'),
    ('BREEZE', NULL, 79, 'm2'),

    -- ── SISAL GOLD ──
    ('SISAL GOLD', '060x133', 79, 'piece'),
    ('SISAL GOLD', '090x160', 125, 'piece'),
    ('SISAL GOLD', '130x190', 189, 'piece'),
    ('SISAL GOLD', '160x240', 275, 'piece'),
    ('SISAL GOLD', '200 ROND', 279, 'piece'),
    ('SISAL GOLD', '200x240', 329, 'piece'),
    ('SISAL GOLD', '240 ROND', 389, 'piece'),
    ('SISAL GOLD', '200x290', 405, 'piece'),
    ('SISAL GOLD', '250x350', 579, 'piece'),
    ('SISAL GOLD', '300x400', 705, 'piece'),
    ('SISAL GOLD', NULL, 105, 'm2'),

    -- ── BERMUDA ──
    ('BERMUDA', '060x133', 105, 'piece'),
    ('BERMUDA', '090x160', 169, 'piece'),
    ('BERMUDA', '130x190', 275, 'piece'),
    ('BERMUDA', '160x240', 405, 'piece'),
    ('BERMUDA', '200 ROND', 429, 'piece'),
    ('BERMUDA', '200x240', 495, 'piece'),
    ('BERMUDA', '200x290', 579, 'piece'),
    ('BERMUDA', '240 ROND', 579, 'piece'),
    ('BERMUDA', '250x350', 859, 'piece'),
    ('BERMUDA', '300x400', 1165, 'piece'),
    ('BERMUDA', NULL, 155, 'm2'),

    -- ── SETI (geen maatwerk) ──
    ('SETI', '060x133', 105, 'piece'),
    ('SETI', '090x160', 135, 'piece'),
    ('SETI', '130x190', 245, 'piece'),
    ('SETI', '160x240', 345, 'piece'),
    ('SETI', '200 ROND', 359, 'piece'),
    ('SETI', '200x240', 405, 'piece'),
    ('SETI', '240 ROND', 495, 'piece'),
    ('SETI', '200x290', 555, 'piece'),
    ('SETI', '250x350', 719, 'piece'),
    ('SETI', '300x400', 965, 'piece'),

    -- ── SISAL LOOP (geen maatwerk) ──
    ('SISAL LOOP', '060x133', 99, 'piece'),
    ('SISAL LOOP', '090x160', 159, 'piece'),
    ('SISAL LOOP', '130x190', 245, 'piece'),
    ('SISAL LOOP', '160x240', 359, 'piece'),
    ('SISAL LOOP', '200 ROND', 399, 'piece'),
    ('SISAL LOOP', '200x240', 455, 'piece'),
    ('SISAL LOOP', '200x290', 555, 'piece'),
    ('SISAL LOOP', '240 ROND', 555, 'piece'),
    ('SISAL LOOP', '250x350', 815, 'piece'),
    ('SISAL LOOP', '300x400', 1095, 'piece'),

    -- ── SPLENDID ──
    ('SPLENDID', '160x230', 799, 'piece'),
    ('SPLENDID', '200x290', 1269, 'piece'),
    ('SPLENDID', NULL, 279, 'm2'),

    -- ── FINESSE (geen maatwerk) ──
    ('FINESSE', '080x150', 265, 'piece'),
    ('FINESSE', '080x200', 355, 'piece'),
    ('FINESSE', '080x300', 539, 'piece'),
    ('FINESSE', '160 ROND', 569, 'piece'),
    ('FINESSE', '135x200', 595, 'piece'),
    ('FINESSE', '160x230', 799, 'piece'),
    ('FINESSE', '200 ROND', 869, 'piece'),
    ('FINESSE', '200x250', 1095, 'piece'),
    ('FINESSE', '200x290', 1259, 'piece'),
    ('FINESSE', '240x290', 1509, 'piece'),
    ('FINESSE', '240x330', 1759, 'piece'),
    ('FINESSE', '300x400', 2615, 'piece'),

    -- ── OLIMPOS (geen maatwerk) ──
    ('OLIMPOS', '080x150', 265, 'piece'),
    ('OLIMPOS', '080x200', 355, 'piece'),
    ('OLIMPOS', '080x300', 539, 'piece'),
    ('OLIMPOS', '160 ROND', 569, 'piece'),
    ('OLIMPOS', '135x200', 595, 'piece'),
    ('OLIMPOS', '160x230', 799, 'piece'),
    ('OLIMPOS', '200 ROND', 869, 'piece'),
    ('OLIMPOS', '200x250', 1095, 'piece'),
    ('OLIMPOS', '200x290', 1259, 'piece'),
    ('OLIMPOS', '240x290', 1509, 'piece'),
    ('OLIMPOS', '240x330', 1759, 'piece'),
    ('OLIMPOS', '300x400', 2615, 'piece'),

    -- ── LUXURY ──
    ('LUXURY', '160x230', 389, 'piece'),
    ('LUXURY', '200x290', 609, 'piece'),
    ('LUXURY', NULL, 135, 'm2'),

    -- ── MARICH ──
    ('MARICH', '160x230', 665, 'piece'),
    ('MARICH', '200x290', 1049, 'piece'),
    ('MARICH', NULL, 229, 'm2'),

    -- ── SOLEIL ──
    ('SOLEIL', '160x230', 259, 'piece'),
    ('SOLEIL', '200x290', 409, 'piece'),
    ('SOLEIL', NULL, 89, 'm2'),

    -- ── ECLAT (geen maatwerk) ──
    ('ECLAT', '160x230', 485, 'piece'),
    ('ECLAT', '200x290', 775, 'piece'),
    ('ECLAT', '240x340', 1035, 'piece'),

    -- ── LIGNE (geen maatwerk) ──
    ('LIGNE', '160x230', 519, 'piece'),
    ('LIGNE', '200x290', 809, 'piece'),
    ('LIGNE', '240x340', 1125, 'piece'),

    -- ── TIFFANY (geen maatwerk) ──
    ('TIFFANY', '160x230', 459, 'piece'),
    ('TIFFANY', '200x290', 719, 'piece'),

    -- ── GALAXY ──
    ('GALAXY', '060x090', 79, 'piece'),
    ('GALAXY', '080 ROND', 99, 'piece'),
    ('GALAXY', '070x140', 135, 'piece'),
    ('GALAXY', '100 ROND', 139, 'piece'),
    ('GALAXY', '090x160', 209, 'piece'),
    ('GALAXY', '120 ROND', 209, 'piece'),
    ('GALAXY', '120x170', 275, 'piece'),
    ('GALAXY', '160 ROND', 345, 'piece'),
    ('GALAXY', '140x200', 385, 'piece'),
    ('GALAXY', '160x230', 495, 'piece'),
    ('GALAXY', '200 ROND', 545, 'piece'),
    ('GALAXY', '200x290', 789, 'piece'),
    ('GALAXY', '400x400', 2269, 'piece'),
    ('GALAXY', '400x600', 3359, 'piece'),
    ('GALAXY', NULL, 167.50, 'm2'),

    -- ── CURLY (geen maatwerk) ──
    ('CURLY', '160x230', 309, 'piece'),
    ('CURLY', '200x290', 495, 'piece'),
    ('CURLY', '250 ROND', 519, 'piece'),

    -- ── PABLO (geen maatwerk) ──
    ('PABLO', '060x090', 55, 'piece'),
    ('PABLO', '080x150', 139, 'piece'),
    ('PABLO', '068x220', 169, 'piece'),
    ('PABLO', '130x190', 279, 'piece'),
    ('PABLO', '160 ROND', 299, 'piece'),
    ('PABLO', '155x230', 389, 'piece'),
    ('PABLO', '200x200', 439, 'piece'),
    ('PABLO', '200 ROND', 459, 'piece'),
    ('PABLO', '200x290', 635, 'piece'),
    ('PABLO', '240x330', 869, 'piece'),
    ('PABLO', '300x400', 1319, 'piece'),

    -- ── EMIR ──
    ('EMIR', '155x230', 359, 'piece'),
    ('EMIR', '200x290', 569, 'piece'),
    ('EMIR', NULL, 129, 'm2'),

    -- ── MARRAKE (geen maatwerk) ──
    ('MARRAKE', '068x120', 95, 'piece'),
    ('MARRAKE', '080x150', 139, 'piece'),
    ('MARRAKE', '068x220', 169, 'piece'),
    ('MARRAKE', '130x190', 279, 'piece'),
    ('MARRAKE', '155x230', 389, 'piece'),
    ('MARRAKE', '200x290', 635, 'piece'),

    -- ── RUBI ──
    ('RUBI', '060x090', 55, 'piece'),
    ('RUBI', '080x150', 135, 'piece'),
    ('RUBI', '068x220', 155, 'piece'),
    ('RUBI', '130x190', 265, 'piece'),
    ('RUBI', '155x230', 375, 'piece'),
    ('RUBI', '200x200', 415, 'piece'),
    ('RUBI', '200x290', 595, 'piece'),
    ('RUBI', '240x330', 829, 'piece'),
    ('RUBI', NULL, 135, 'm2'),

    -- ── CHAIN (geen maatwerk) ──
    ('CHAIN', '080x150', 145, 'piece'),
    ('CHAIN', '120x170', 249, 'piece'),
    ('CHAIN', '155x230', 445, 'piece'),
    ('CHAIN', '200x290', 695, 'piece'),

    -- ── MODRA (geen maatwerk) ──
    ('MODRA', '155x230', 389, 'piece'),
    ('MODRA', '200x290', 635, 'piece'),
    ('MODRA', '240x330', 869, 'piece'),

    -- ── CAS (geen maatwerk) ──
    ('CAS', '060x090', 55, 'piece'),
    ('CAS', '080x150', 139, 'piece'),
    ('CAS', '068x220', 169, 'piece'),
    ('CAS', '130x190', 279, 'piece'),
    ('CAS', '160 ROND', 299, 'piece'),
    ('CAS', '155x230', 389, 'piece'),
    ('CAS', '200 ROND', 459, 'piece'),
    ('CAS', '200x290', 635, 'piece'),
    ('CAS', '240x330', 869, 'piece'),

    -- ── BABYLON (geen maatwerk) ──
    ('BABYLON', '120 ROND', 79, 'piece'),
    ('BABYLON', '120x180', 125, 'piece'),
    ('BABYLON', '160x230', 209, 'piece'),
    ('BABYLON', '200x290', 329, 'piece'),
    ('BABYLON', '240 ROND', 329, 'piece'),

    -- ── ZEN (geen maatwerk) ──
    ('ZEN', '160x230', 365, 'piece'),
    ('ZEN', '200x290', 565, 'piece'),

    -- ── LOUVRE ──
    ('LOUVRE', '160x230', 285, 'piece'),
    ('LOUVRE', '200x290', 445, 'piece'),
    ('LOUVRE', NULL, 99, 'm2'),

    -- ── GENTLE ──
    ('GENTLE', '160x230', 625, 'piece'),
    ('GENTLE', '200x290', 979, 'piece'),
    ('GENTLE', NULL, 219, 'm2'),

    -- ── CACHET ──
    ('CACHET', '160x230', 649, 'piece'),
    ('CACHET', '200x290', 1035, 'piece'),
    ('CACHET', NULL, 225, 'm2'),

    -- ── ROYALE ──
    ('ROYALE', '200x290', 1829, 'piece'),
    ('ROYALE', '250x350', 2809, 'piece'),
    ('ROYALE', '300 ROND', 2809, 'piece'),
    ('ROYALE', NULL, 395, 'm2'),

    -- ── LAGO ──
    ('LAGO', '080x150', 139, 'piece'),
    ('LAGO', '120x170', 225, 'piece'),
    ('LAGO', '130x190', 279, 'piece'),
    ('LAGO', '160x230', 415, 'piece'),
    ('LAGO', '200x200', 459, 'piece'),
    ('LAGO', '200x250', 569, 'piece'),
    ('LAGO', '200x290', 649, 'piece'),
    ('LAGO', '240x340', 899, 'piece'),
    ('LAGO', NULL, 145, 'm2'),

    -- ── LAGO MIX ──
    ('LAGO MIX', '080x150', 139, 'piece'),
    ('LAGO MIX', '120x170', 225, 'piece'),
    ('LAGO MIX', '130x190', 279, 'piece'),
    ('LAGO MIX', '160x230', 415, 'piece'),
    ('LAGO MIX', '200x200', 459, 'piece'),
    ('LAGO MIX', '200x250', 569, 'piece'),
    ('LAGO MIX', '200x290', 649, 'piece'),
    ('LAGO MIX', '240x340', 899, 'piece'),
    ('LAGO MIX', NULL, 145, 'm2'),

    -- ── OMBRE (geen maatwerk) ──
    ('OMBRE', '220 ROND', 639, 'piece'),
    ('OMBRE', '280 ROND', 1035, 'piece'),

    -- ── CISCO ──
    ('CISCO', '080x150', 135, 'piece'),
    ('CISCO', '130x190', 265, 'piece'),
    ('CISCO', '160x230', 385, 'piece'),
    ('CISCO', '200x290', 609, 'piece'),
    ('CISCO', '240x330', 825, 'piece'),
    ('CISCO', NULL, 135, 'm2'),

    -- ── PLUSH (geen maatwerk) ──
    ('PLUSH', '060x090', 45, 'piece'),
    ('PLUSH', '080 ROND', 55, 'piece'),
    ('PLUSH', '070x140', 85, 'piece'),
    ('PLUSH', '090x160', 109, 'piece'),
    ('PLUSH', '120 ROND', 109, 'piece'),
    ('PLUSH', '120x170', 165, 'piece'),
    ('PLUSH', '140x180', 195, 'piece'),
    ('PLUSH', '160 ROND', 209, 'piece'),
    ('PLUSH', '160x230', 279, 'piece'),
    ('PLUSH', '180x250', 359, 'piece'),
    ('PLUSH', '200x290', 459, 'piece'),

    -- ── BEACH LIFE ──
    ('BEACH LIFE', '160 ROND', 729, 'piece'),
    ('BEACH LIFE', '140x200', 799, 'piece'),
    ('BEACH LIFE', '160x230', 1045, 'piece'),
    ('BEACH LIFE', '200 ROND', 1125, 'piece'),
    ('BEACH LIFE', '200x240', 1359, 'piece'),
    ('BEACH LIFE', '200x290', 1635, 'piece'),
    ('BEACH LIFE', '240 ROND', 1635, 'piece'),
    ('BEACH LIFE', '250x350', 2485, 'piece'),
    ('BEACH LIFE', '300 ROND', 2549, 'piece'),
    ('BEACH LIFE', '300x400', 3399, 'piece'),
    ('BEACH LIFE', NULL, 389, 'm2'),

    -- ── GALA (alleen maatwerk) ──
    ('GALA', NULL, 167.50, 'm2'),

    -- ── LAMI (alleen maatwerk) ──
    ('LAMI', NULL, 145, 'm2');

  -- ═══════════════════════════════════════════════════════════
  -- A) Kwaliteiten koppelen aan hun afmetingen
  -- ═══════════════════════════════════════════════════════════
  INSERT INTO quality_carpet_dimensions (quality_id, carpet_dimension_id, active)
  SELECT DISTINCT q.id, cd.id, true
  FROM _prijslijst p
  JOIN qualities q ON UPPER(q.name) = UPPER(p.quality_name)
  JOIN carpet_dimensions cd ON cd.name = p.dim_name
  WHERE p.dim_name IS NOT NULL
  ON CONFLICT (quality_id, carpet_dimension_id) DO UPDATE SET active = true;

  -- ═══════════════════════════════════════════════════════════
  -- B) INKOOPPRIJZEN opslaan (= verkoopprijs / 3.025, in centen)
  -- ═══════════════════════════════════════════════════════════

  -- Per stuk (vaste maten)
  FOR r IN
    SELECT q.id AS quality_id, cd.id AS dim_id,
           round(p.vk_euros / 3.025 * 100)::int AS price_cents
    FROM _prijslijst p
    JOIN qualities q ON UPPER(q.name) = UPPER(p.quality_name)
    JOIN carpet_dimensions cd ON cd.name = p.dim_name
    WHERE p.dim_name IS NOT NULL
  LOOP
    UPDATE quality_base_prices
    SET price_cents = r.price_cents, unit = 'piece', updated_at = now()
    WHERE quality_id = r.quality_id AND carpet_dimension_id = r.dim_id;

    IF NOT FOUND THEN
      INSERT INTO quality_base_prices (quality_id, carpet_dimension_id, price_cents, unit)
      VALUES (r.quality_id, r.dim_id, r.price_cents, 'piece');
    END IF;
  END LOOP;

  -- Per m² (maatwerk — alleen als het in de prijslijst staat)
  FOR r IN
    SELECT q.id AS quality_id,
           round(p.vk_euros / 3.025 * 100)::int AS price_cents
    FROM _prijslijst p
    JOIN qualities q ON UPPER(q.name) = UPPER(p.quality_name)
    WHERE p.dim_name IS NULL AND p.unit = 'm2'
  LOOP
    UPDATE quality_base_prices
    SET price_cents = r.price_cents, unit = 'm2', updated_at = now()
    WHERE quality_id = r.quality_id AND carpet_dimension_id IS NULL;

    IF NOT FOUND THEN
      INSERT INTO quality_base_prices (quality_id, carpet_dimension_id, price_cents, unit)
      VALUES (r.quality_id, NULL, r.price_cents, 'm2');
    END IF;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════
  -- C) qualities.base_price updaten met inkoopprijs/m²
  --    (= maatwerk verkoopprijs / 3.025, als referentie)
  -- ═══════════════════════════════════════════════════════════
  UPDATE qualities q
  SET base_price = sub.inkoop_m2
  FROM (
    SELECT quality_name, round(vk_euros / 3.025, 2) AS inkoop_m2
    FROM _prijslijst
    WHERE dim_name IS NULL AND unit = 'm2'
  ) sub
  WHERE UPPER(q.name) = UPPER(sub.quality_name);

  RAISE NOTICE 'Prijslijst import voltooid: % rijen verwerkt', (SELECT count(*) FROM _prijslijst);
END $$;
