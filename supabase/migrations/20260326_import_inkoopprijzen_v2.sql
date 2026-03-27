-- ════════════════════════════════════════════════════════════════
-- Migration: Import inkoopprijzen uit officiële prijslijsten
-- Bron:
--   1. Inkoopprijslijst DESIGNS per 16-03-2026
--   2. Inkoopprijslijst MAATWERK COLLECTIE per 16-3-26
--      (hoogpool en natuur DEF)
--
-- Alle bedragen zijn INKOOPPRIJZEN in euro's.
-- Opslag in quality_base_prices als centen (× 100).
-- ════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- STAP 1: notes kolom toevoegen aan qualities
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE qualities ADD COLUMN IF NOT EXISTS notes TEXT;

-- ═══════════════════════════════════════════════════════════════
-- STAP 2: Nieuwe kwaliteit — Beach Life Mix (kleur nr. 99)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO qualities (name, code, active, notes)
SELECT 'BEACH LIFE MIX', 'BLMX', true, 'Kleur nr. 99'
WHERE NOT EXISTS (
  SELECT 1 FROM qualities WHERE UPPER(name) = 'BEACH LIFE MIX'
);

-- ═══════════════════════════════════════════════════════════════
-- STAP 3: Nieuwe afmetingen
-- ═══════════════════════════════════════════════════════════════
INSERT INTO carpet_dimensions (width_cm, height_cm, name) VALUES
  -- Galaxy organische vormen
  (160, 230, '160x230 organisch'),
  (200, 290, '200x290 organisch')
ON CONFLICT (name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- STAP 4: Alle inkoopprijzen importeren
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  r RECORD;
BEGIN
  CREATE TEMP TABLE _prijslijst (
    quality_name TEXT,
    dim_name     TEXT,   -- NULL = maatwerk per m²
    ik_euros     NUMERIC,
    unit         TEXT    -- 'piece' of 'm2'
  ) ON COMMIT DROP;

  INSERT INTO _prijslijst (quality_name, dim_name, ik_euros, unit) VALUES
    -- ══════════════════════════════════════════════════════════
    -- DESIGNS (gedessineerde karpetten)
    -- ══════════════════════════════════════════════════════════

    -- ── BABYLON ──
    ('BABYLON', '120x180', 50, 'piece'),
    ('BABYLON', '160x230', 83, 'piece'),
    ('BABYLON', '200x290', 131, 'piece'),
    ('BABYLON', '120 ROND', 32, 'piece'),
    ('BABYLON', '240 ROND', 132, 'piece'),

    -- ── CAS (Cass in prijslijst) ──
    ('CAS', '060x090', 22, 'piece'),
    ('CAS', '068x220', 67, 'piece'),
    ('CAS', '080x150', 55, 'piece'),
    ('CAS', '130x190', 111, 'piece'),
    ('CAS', '155x230', 156, 'piece'),
    ('CAS', '200x290', 253, 'piece'),
    ('CAS', '240x330', 348, 'piece'),
    ('CAS', '160 ROND', 121, 'piece'),
    ('CAS', '200 ROND', 183, 'piece'),

    -- ── CHAIN ──
    ('CHAIN', '080x150', 58, 'piece'),
    ('CHAIN', '120x170', 99, 'piece'),
    ('CHAIN', '155x230', 177, 'piece'),
    ('CHAIN', '200x290', 277, 'piece'),

    -- ── COLORED PATCH ──
    ('COLORED PATCH', '155x230', 156, 'piece'),
    ('COLORED PATCH', '200x290', 253, 'piece'),
    ('COLORED PATCH', '240x330', 348, 'piece'),

    -- ── CURLY ──
    ('CURLY', '160x230', 124, 'piece'),
    ('CURLY', '200x290', 198, 'piece'),
    ('CURLY', '250 ROND', 208, 'piece'),

    -- ── ECLAT ──
    ('ECLAT', '160x230', 194, 'piece'),
    ('ECLAT', '200x290', 309, 'piece'),
    ('ECLAT', '240x340', 413, 'piece'),

    -- ── GALAXY ──
    ('GALAXY', '060x090', 32, 'piece'),
    ('GALAXY', '070x140', 54, 'piece'),
    ('GALAXY', '090x160', 83, 'piece'),
    ('GALAXY', '120x170', 110, 'piece'),
    ('GALAXY', '140x200', 154, 'piece'),
    ('GALAXY', '160x230', 198, 'piece'),
    ('GALAXY', '200x290', 316, 'piece'),
    ('GALAXY', '400x400', 907, 'piece'),
    ('GALAXY', '400x600', 1344, 'piece'),
    ('GALAXY', '080 ROND', 39, 'piece'),
    ('GALAXY', '100 ROND', 55, 'piece'),
    ('GALAXY', '120 ROND', 83, 'piece'),
    ('GALAXY', '160 ROND', 138, 'piece'),
    ('GALAXY', '200 ROND', 218, 'piece'),
    ('GALAXY', '160x230 organisch', 250, 'piece'),
    ('GALAXY', '200x290 organisch', 396, 'piece'),

    -- ── LIGNE ──
    ('LIGNE', '160x230', 208, 'piece'),
    ('LIGNE', '200x290', 323, 'piece'),
    ('LIGNE', '240x340', 449, 'piece'),

    -- ── MARRAKE ──
    ('MARRAKE', '068x120', 37, 'piece'),
    ('MARRAKE', '068x220', 67, 'piece'),
    ('MARRAKE', '080x150', 55, 'piece'),
    ('MARRAKE', '130x190', 111, 'piece'),
    ('MARRAKE', '155x230', 156, 'piece'),
    ('MARRAKE', '200x290', 253, 'piece'),

    -- ── MODRA ──
    ('MODRA', '155x230', 156, 'piece'),
    ('MODRA', '200x290', 253, 'piece'),
    ('MODRA', '240x330', 348, 'piece'),

    -- ── OLIMPOS (zelfde prijzen als Finesse) ──
    ('OLIMPOS', '080x150', 105, 'piece'),
    ('OLIMPOS', '080x200', 142, 'piece'),
    ('OLIMPOS', '080x300', 215, 'piece'),
    ('OLIMPOS', '135x200', 237, 'piece'),
    ('OLIMPOS', '160x230', 320, 'piece'),
    ('OLIMPOS', '200x250', 437, 'piece'),
    ('OLIMPOS', '200x290', 503, 'piece'),
    ('OLIMPOS', '240x290', 604, 'piece'),
    ('OLIMPOS', '240x330', 703, 'piece'),
    ('OLIMPOS', '300x400', 1045, 'piece'),
    ('OLIMPOS', '160 ROND', 227, 'piece'),
    ('OLIMPOS', '200 ROND', 348, 'piece'),

    -- ── FINESSE (zelfde prijzen als Olimpos) ──
    ('FINESSE', '080x150', 105, 'piece'),
    ('FINESSE', '080x200', 142, 'piece'),
    ('FINESSE', '080x300', 215, 'piece'),
    ('FINESSE', '135x200', 237, 'piece'),
    ('FINESSE', '160x230', 320, 'piece'),
    ('FINESSE', '200x250', 437, 'piece'),
    ('FINESSE', '200x290', 503, 'piece'),
    ('FINESSE', '240x290', 604, 'piece'),
    ('FINESSE', '240x330', 703, 'piece'),
    ('FINESSE', '300x400', 1045, 'piece'),
    ('FINESSE', '160 ROND', 227, 'piece'),
    ('FINESSE', '200 ROND', 348, 'piece'),

    -- ── OMBRE ──
    ('OMBRE', '220 ROND', 256, 'piece'),
    ('OMBRE', '280 ROND', 413, 'piece'),

    -- ── PABLO ──
    ('PABLO', '060x090', 22, 'piece'),
    ('PABLO', '068x220', 67, 'piece'),
    ('PABLO', '080x150', 55, 'piece'),
    ('PABLO', '130x190', 111, 'piece'),
    ('PABLO', '155x230', 156, 'piece'),
    ('PABLO', '200x200', 175, 'piece'),
    ('PABLO', '200x290', 253, 'piece'),
    ('PABLO', '240x330', 348, 'piece'),
    ('PABLO', '300x400', 528, 'piece'),
    ('PABLO', '160 ROND', 121, 'piece'),
    ('PABLO', '200 ROND', 183, 'piece'),

    -- ── PLUSH ──
    ('PLUSH', '060x090', 17, 'piece'),
    ('PLUSH', '070x140', 33, 'piece'),
    ('PLUSH', '090x160', 44, 'piece'),
    ('PLUSH', '120x170', 65, 'piece'),
    ('PLUSH', '140x180', 77, 'piece'),
    ('PLUSH', '160x230', 111, 'piece'),
    ('PLUSH', '180x250', 144, 'piece'),
    ('PLUSH', '200x290', 183, 'piece'),
    ('PLUSH', '080 ROND', 22, 'piece'),
    ('PLUSH', '120 ROND', 44, 'piece'),
    ('PLUSH', '160 ROND', 83, 'piece'),

    -- ── TIFFANY ──
    ('TIFFANY', '160x230', 183, 'piece'),
    ('TIFFANY', '200x290', 288, 'piece'),

    -- ── ZEN ──
    ('ZEN', '160x230', 145, 'piece'),
    ('ZEN', '200x290', 225, 'piece'),

    -- ══════════════════════════════════════════════════════════
    -- MAATWERK COLLECTIE (hoogpool)
    -- ══════════════════════════════════════════════════════════

    -- ── BEACH LIFE ──
    ('BEACH LIFE', '140x200', 319, 'piece'),
    ('BEACH LIFE', '160x230', 417, 'piece'),
    ('BEACH LIFE', '200x240', 543, 'piece'),
    ('BEACH LIFE', '200x290', 654, 'piece'),
    ('BEACH LIFE', '250x350', 993, 'piece'),
    ('BEACH LIFE', '300x400', 1359, 'piece'),
    ('BEACH LIFE', '160 ROND', 292, 'piece'),
    ('BEACH LIFE', '200 ROND', 449, 'piece'),
    ('BEACH LIFE', '240 ROND', 654, 'piece'),
    ('BEACH LIFE', '300 ROND', 1020, 'piece'),
    ('BEACH LIFE', NULL, 152, 'm2'),

    -- ── BEACH LIFE MIX (kleur nr. 99) ──
    ('BEACH LIFE MIX', '140x200', 334, 'piece'),
    ('BEACH LIFE MIX', '160x230', 438, 'piece'),
    ('BEACH LIFE MIX', '200x240', 574, 'piece'),
    ('BEACH LIFE MIX', '200x290', 696, 'piece'),
    ('BEACH LIFE MIX', '250x350', 1045, 'piece'),
    ('BEACH LIFE MIX', '300x400', 1438, 'piece'),
    ('BEACH LIFE MIX', '160 ROND', 309, 'piece'),
    ('BEACH LIFE MIX', '200 ROND', 480, 'piece'),
    ('BEACH LIFE MIX', '240 ROND', 689, 'piece'),
    ('BEACH LIFE MIX', '300 ROND', 1076, 'piece'),
    ('BEACH LIFE MIX', NULL, 162, 'm2'),

    -- ── BILAL ──
    ('BILAL', '160x230', 155, 'piece'),
    ('BILAL', '200x290', 243, 'piece'),
    ('BILAL', NULL, 53, 'm2'),

    -- ── BIRMA ──
    ('BIRMA', '160x230', 154, 'piece'),
    ('BIRMA', '200x290', 244, 'piece'),
    ('BIRMA', NULL, 53, 'm2'),

    -- ── BREEZE ──
    ('BREEZE', '160x230', 93, 'piece'),
    ('BREEZE', '200x290', 146, 'piece'),
    ('BREEZE', NULL, 32, 'm2'),

    -- ── SEASON (Outdoor, zelfde prijzen als Breeze) ──
    ('SEASON', '160x230', 93, 'piece'),
    ('SEASON', '200x290', 146, 'piece'),
    ('SEASON', NULL, 32, 'm2'),

    -- ── CACHET ──
    ('CACHET', '160x230', 260, 'piece'),
    ('CACHET', '200x290', 413, 'piece'),
    ('CACHET', NULL, 89, 'm2'),

    -- ── CISCO ──
    ('CISCO', '080x150', 54, 'piece'),
    ('CISCO', '130x190', 106, 'piece'),
    ('CISCO', '160x230', 154, 'piece'),
    ('CISCO', '200x290', 243, 'piece'),
    ('CISCO', '240x330', 330, 'piece'),
    ('CISCO', NULL, 53, 'm2'),

    -- ── DANTE (alleen maatwerk) ──
    ('DANTE', NULL, 79, 'm2'),

    -- ── EMIR ──
    ('EMIR', '155x230', 143, 'piece'),
    ('EMIR', '200x290', 227, 'piece'),
    ('EMIR', NULL, 52, 'm2'),

    -- ── GENTLE ──
    ('GENTLE', '160x230', 250, 'piece'),
    ('GENTLE', '200x290', 392, 'piece'),
    ('GENTLE', NULL, 87, 'm2'),

    -- ── HARMONY ──
    ('HARMONY', '130x190', 69, 'piece'),
    ('HARMONY', '160x230', 104, 'piece'),
    ('HARMONY', '200x290', 163, 'piece'),
    ('HARMONY', '160 ROND', 77, 'piece'),
    ('HARMONY', '200 ROND', 121, 'piece'),
    ('HARMONY', NULL, 36, 'm2'),

    -- ── LAGO ──
    ('LAGO', '080x150', 55, 'piece'),
    ('LAGO', '120x170', 89, 'piece'),
    ('LAGO', '130x190', 111, 'piece'),
    ('LAGO', '160x230', 166, 'piece'),
    ('LAGO', '200x200', 183, 'piece'),
    ('LAGO', '200x250', 227, 'piece'),
    ('LAGO', '200x290', 260, 'piece'),
    ('LAGO', '240x340', 360, 'piece'),
    ('LAGO', NULL, 58, 'm2'),

    -- ── LAGO MIX (zelfde prijzen als Lago) ──
    ('LAGO MIX', '080x150', 55, 'piece'),
    ('LAGO MIX', '120x170', 89, 'piece'),
    ('LAGO MIX', '130x190', 111, 'piece'),
    ('LAGO MIX', '160x230', 166, 'piece'),
    ('LAGO MIX', '200x200', 183, 'piece'),
    ('LAGO MIX', '200x250', 227, 'piece'),
    ('LAGO MIX', '200x290', 260, 'piece'),
    ('LAGO MIX', '240x340', 360, 'piece'),
    ('LAGO MIX', NULL, 58, 'm2'),

    -- ── LORANDA ──
    ('LORANDA', '160x230', 128, 'piece'),
    ('LORANDA', '200x290', 194, 'piece'),
    ('LORANDA', NULL, 44, 'm2'),

    -- ── LOUVRE ──
    ('LOUVRE', '160x230', 114, 'piece'),
    ('LOUVRE', '200x290', 177, 'piece'),
    ('LOUVRE', NULL, 39, 'm2'),

    -- ── LUXURY ──
    ('LUXURY', '160x230', 155, 'piece'),
    ('LUXURY', '200x290', 244, 'piece'),
    ('LUXURY', NULL, 54, 'm2'),

    -- ── MARICH ──
    ('MARICH', '160x230', 266, 'piece'),
    ('MARICH', '200x290', 420, 'piece'),
    ('MARICH', NULL, 92, 'm2'),

    -- ── RUBI ──
    ('RUBI', '060x090', 21, 'piece'),
    ('RUBI', '068x220', 61, 'piece'),
    ('RUBI', '080x150', 54, 'piece'),
    ('RUBI', '130x190', 105, 'piece'),
    ('RUBI', '155x230', 150, 'piece'),
    ('RUBI', '200x200', 165, 'piece'),
    ('RUBI', '200x290', 238, 'piece'),
    ('RUBI', '240x330', 331, 'piece'),
    ('RUBI', NULL, 54, 'm2'),

    -- ── ROYALE ──
    ('ROYALE', '200x290', 731, 'piece'),
    ('ROYALE', '250x350', 1124, 'piece'),
    ('ROYALE', '300 ROND', 1124, 'piece'),
    ('ROYALE', NULL, 158, 'm2'),

    -- ── SOLEIL ──
    ('SOLEIL', '160x230', 104, 'piece'),
    ('SOLEIL', '200x290', 163, 'piece'),
    ('SOLEIL', NULL, 36, 'm2'),

    -- ── SPLENDID ──
    ('SPLENDID', '160x230', 320, 'piece'),
    ('SPLENDID', '200x290', 508, 'piece'),
    ('SPLENDID', NULL, 111, 'm2'),

    -- ══════════════════════════════════════════════════════════
    -- NATUURCOLLECTIE
    -- ══════════════════════════════════════════════════════════

    -- ── BERMUDA ──
    ('BERMUDA', '060x133', 42, 'piece'),
    ('BERMUDA', '090x160', 68, 'piece'),
    ('BERMUDA', '130x190', 110, 'piece'),
    ('BERMUDA', '160x240', 162, 'piece'),
    ('BERMUDA', '200x240', 198, 'piece'),
    ('BERMUDA', '200x290', 232, 'piece'),
    ('BERMUDA', '250x350', 343, 'piece'),
    ('BERMUDA', '300x400', 465, 'piece'),
    ('BERMUDA', '200 ROND', 172, 'piece'),
    ('BERMUDA', '240 ROND', 232, 'piece'),
    ('BERMUDA', NULL, 62, 'm2'),

    -- ── SETI ──
    ('SETI', '060x133', 41, 'piece'),
    ('SETI', '090x160', 54, 'piece'),
    ('SETI', '130x190', 98, 'piece'),
    ('SETI', '160x240', 138, 'piece'),
    ('SETI', '200x240', 162, 'piece'),
    ('SETI', '200x290', 221, 'piece'),
    ('SETI', '250x350', 288, 'piece'),
    ('SETI', '300x400', 386, 'piece'),
    ('SETI', '200 ROND', 144, 'piece'),
    ('SETI', '240 ROND', 198, 'piece'),
    ('SETI', NULL, 51, 'm2'),

    -- ── SISAL LOOP (Loop in prijslijst) ──
    ('SISAL LOOP', '060x133', 40, 'piece'),
    ('SISAL LOOP', '090x160', 63, 'piece'),
    ('SISAL LOOP', '130x190', 98, 'piece'),
    ('SISAL LOOP', '160x240', 144, 'piece'),
    ('SISAL LOOP', '200x240', 182, 'piece'),
    ('SISAL LOOP', '200x290', 222, 'piece'),
    ('SISAL LOOP', '250x350', 326, 'piece'),
    ('SISAL LOOP', '300x400', 437, 'piece'),
    ('SISAL LOOP', '200 ROND', 161, 'piece'),
    ('SISAL LOOP', '240 ROND', 222, 'piece'),
    ('SISAL LOOP', NULL, 59, 'm2'),

    -- ── SISAL GOLD ──
    ('SISAL GOLD', '060x133', 32, 'piece'),
    ('SISAL GOLD', '090x160', 50, 'piece'),
    ('SISAL GOLD', '130x190', 76, 'piece'),
    ('SISAL GOLD', '160x240', 110, 'piece'),
    ('SISAL GOLD', '200x240', 132, 'piece'),
    ('SISAL GOLD', '200x290', 161, 'piece'),
    ('SISAL GOLD', '250x350', 231, 'piece'),
    ('SISAL GOLD', '300x400', 282, 'piece'),
    ('SISAL GOLD', '200 ROND', 111, 'piece'),
    ('SISAL GOLD', '240 ROND', 155, 'piece'),
    ('SISAL GOLD', NULL, 41, 'm2');

  -- ═══════════════════════════════════════════════════════════
  -- A) Kwaliteiten koppelen aan hun specifieke afmetingen
  -- ═══════════════════════════════════════════════════════════
  INSERT INTO quality_carpet_dimensions (quality_id, carpet_dimension_id, active)
  SELECT DISTINCT q.id, cd.id, true
  FROM _prijslijst p
  JOIN qualities q ON UPPER(q.name) = UPPER(p.quality_name) AND q.active = true
  JOIN carpet_dimensions cd ON cd.name = p.dim_name
  WHERE p.dim_name IS NOT NULL
  ON CONFLICT (quality_id, carpet_dimension_id) DO UPDATE SET active = true;

  -- ═══════════════════════════════════════════════════════════
  -- B) INKOOPPRIJZEN opslaan (in centen)
  -- ═══════════════════════════════════════════════════════════

  -- Per stuk (vaste maten)
  FOR r IN
    SELECT DISTINCT ON (q.id, cd.id)
           q.id AS quality_id, cd.id AS dim_id,
           round(p.ik_euros * 100)::int AS price_cents
    FROM _prijslijst p
    JOIN qualities q ON UPPER(q.name) = UPPER(p.quality_name) AND q.active = true
    JOIN carpet_dimensions cd ON cd.name = p.dim_name
    WHERE p.dim_name IS NOT NULL
    ORDER BY q.id, cd.id
  LOOP
    INSERT INTO quality_base_prices (quality_id, carpet_dimension_id, price_cents, unit)
    VALUES (r.quality_id, r.dim_id, r.price_cents, 'piece');
  END LOOP;

  -- Per m² (maatwerk / afwijkende maten)
  FOR r IN
    SELECT DISTINCT ON (q.id)
           q.id AS quality_id,
           round(p.ik_euros * 100)::int AS price_cents
    FROM _prijslijst p
    JOIN qualities q ON UPPER(q.name) = UPPER(p.quality_name) AND q.active = true
    WHERE p.dim_name IS NULL AND p.unit = 'm2'
    ORDER BY q.id
  LOOP
    INSERT INTO quality_base_prices (quality_id, carpet_dimension_id, price_cents, unit)
    VALUES (r.quality_id, NULL, r.price_cents, 'm2');
  END LOOP;

  -- ═══════════════════════════════════════════════════════════
  -- C) qualities.base_price updaten met inkoopprijs per m²
  -- ═══════════════════════════════════════════════════════════
  UPDATE qualities q
  SET base_price = sub.ik_m2
  FROM (
    SELECT DISTINCT ON (quality_name)
           quality_name, ik_euros AS ik_m2
    FROM _prijslijst
    WHERE dim_name IS NULL AND unit = 'm2'
    ORDER BY quality_name
  ) sub
  WHERE UPPER(q.name) = UPPER(sub.quality_name)
    AND q.active = true;

  RAISE NOTICE 'Prijslijst import voltooid: % rijen verwerkt', (SELECT count(*) FROM _prijslijst);
END $$;

-- ═══════════════════════════════════════════════════════════════
-- STAP 5: Accessories check constraint uitbreiden
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE accessories DROP CONSTRAINT IF EXISTS accessories_type_check;
ALTER TABLE accessories ADD CONSTRAINT accessories_type_check
  CHECK (type IN ('roede', 'display', 'anti_slip', 'plush_product', 'staal'));

-- ═══════════════════════════════════════════════════════════════
-- STAP 6: ANTI SLIP accessoires (verkocht per doos)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO accessories (name, type, default_price_cents, active)
SELECT v.name, v.type, v.price, true
FROM (VALUES
  ('Anti Slip 080x150 (20 st/doos)', 'anti_slip', 12000),
  ('Anti Slip 130x190 (15 st/doos)', 'anti_slip', 12000),
  ('Anti Slip 160x230 (12 st/doos)', 'anti_slip', 13200),
  ('Anti Slip 190x290 (8 st/doos)',  'anti_slip', 12800),
  ('Anti Slip 240x340 (5 st/doos)',  'anti_slip', 11500),
  ('Anti Slip 300x400 (4 st/doos)',  'anti_slip', 16000)
) AS v(name, type, price)
WHERE NOT EXISTS (
  SELECT 1 FROM accessories a WHERE a.name = v.name
);

-- ═══════════════════════════════════════════════════════════════
-- STAP 7: Plush vormproducten (gevulde kussens)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO accessories (name, type, default_price_cents, active)
SELECT v.name, v.type, v.price, true
FROM (VALUES
  ('Plush rode hartjes kussen', 'plush_product', 1750),
  ('Plush IJsbeertje',          'plush_product', 1750),
  ('Plush Wolkje',              'plush_product', 1750),
  ('Plush Konijntje',           'plush_product', 1750),
  ('Plush Teddybeer',           'plush_product', 1750)
) AS v(name, type, price)
WHERE NOT EXISTS (
  SELECT 1 FROM accessories a WHERE a.name = v.name
);

-- ═══════════════════════════════════════════════════════════════
-- STAP 8: Staalprijs als accessoire
-- ═══════════════════════════════════════════════════════════════
INSERT INTO accessories (name, type, default_price_cents, active)
SELECT 'Staal 20x20 cm', 'staal', 500, true
WHERE NOT EXISTS (
  SELECT 1 FROM accessories WHERE name = 'Staal 20x20 cm'
);

-- ═══════════════════════════════════════════════════════════════
-- STAP 9: Kwaliteit-specifieke notities
-- ═══════════════════════════════════════════════════════════════
UPDATE qualities SET notes = 'Max. breedte 310 cm' WHERE UPPER(name) = 'EMIR';
UPDATE qualities SET notes = 'Max. breedte 310 cm' WHERE UPPER(name) = 'RUBI';
UPDATE qualities SET notes = 'Afgewerkt met katoenen band naar keuze (uit bandset)' WHERE UPPER(name) = 'BERMUDA';
UPDATE qualities SET notes = 'Afgewerkt met katoenen band naar keuze (uit bandset)' WHERE UPPER(name) = 'SETI';
UPDATE qualities SET notes = 'Afgewerkt met katoenen band naar keuze (uit bandset)' WHERE UPPER(name) = 'SISAL LOOP';
UPDATE qualities SET notes = 'Kan afgewerkt worden met katoenen band of gelockt (conform staal kleur 14, 17 of 22)' WHERE UPPER(name) = 'SISAL GOLD';
UPDATE qualities SET notes = 'Outdoor' WHERE UPPER(name) = 'SEASON';
UPDATE qualities SET notes = 'Kleur nr. 99' WHERE UPPER(name) = 'BEACH LIFE MIX';

-- ═══════════════════════════════════════════════════════════════
-- Info uit prijslijsten (niet in DB, ter referentie):
--
-- Leveringscondities:
--   Bestellingen < €500: €35 vrachtkosten
--   Bestellingen ≥ €500: franco huis
--
-- Betalingsvoorwaarden:
--   14 dagen netto, prijzen excl. BTW
--
-- Afwijkende maten (maatwerk):
--   Min. afmeting: ca. 090x160 cm
--   Max. breedte: ca. 395 cm
--   Levertijd: ca. 3-4 weken
--   Afwerking: breedband en feston (smal) mogelijk
-- ═══════════════════════════════════════════════════════════════
