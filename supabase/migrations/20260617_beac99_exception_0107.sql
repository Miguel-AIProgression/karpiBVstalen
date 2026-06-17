-- ============================================================
-- Uitzondering: BEACH LIFE (BEAC) kleur 99 duurder — prijslijst 0107
-- ============================================================
-- GEGENEREERD door scripts/beac99-exception-0107.mjs --emit
-- Bron: advies_prijslt0107_a.xlsx
-- Volledige kleur-override (price_list_color_lines wint in pricing.ts).
-- Idempotent: eerst de bestaande override voor (0107,BEAC,99) wissen.
-- color_codes is per-kwaliteit gescoped → join op code 99 ÉN quality_id.
-- ============================================================

DELETE FROM price_list_color_lines pcl
USING qualities q, color_codes cc
WHERE pcl.price_list_nr = '0107'
  AND q.code = 'BEAC' AND pcl.quality_id = q.id
  AND cc.code = '99' AND cc.quality_id = q.id AND pcl.color_code_id = cc.id;

-- 10 stuks-prijzen (kleur 99)
INSERT INTO price_list_color_lines (price_list_nr, quality_id, color_code_id, carpet_dimension_id, price_cents, unit)
SELECT '0107', q.id, cc.id, cd.id, v.price_cents, 'piece'
FROM (VALUES
  ('140x200', 83500),
  ('160x230', 109500),
  ('160 ROND', 77500),
  ('200x240', 143500),
  ('200x290', 173900),
  ('200 ROND', 119900),
  ('240 ROND', 172500),
  ('250x350', 261500),
  ('300x400', 359500),
  ('300 ROND', 268900)
) AS v(carpet_dim_name, price_cents)
JOIN qualities q          ON q.code = 'BEAC'
JOIN color_codes cc       ON cc.code = '99' AND cc.quality_id = q.id
JOIN carpet_dimensions cd ON cd.name = v.carpet_dim_name AND cd.active = true;

-- m²-prijs maatwerk (kleur 99)
INSERT INTO price_list_color_lines (price_list_nr, quality_id, color_code_id, carpet_dimension_id, price_cents, unit)
SELECT '0107', q.id, cc.id, NULL, 37900, 'm2'
FROM qualities q
JOIN color_codes cc ON cc.code = '99' AND cc.quality_id = q.id
WHERE q.code = 'BEAC';
