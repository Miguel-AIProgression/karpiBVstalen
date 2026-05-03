-- ============================================================
-- Prijslijsten 0210 t/m 0217 — headers + klant-remap
-- ============================================================
-- Achtergrond:
-- v2 importeerde 0150 (Benelux) en 0151 (Benelux + MV) op basis van
-- klantenbestanden met (synthetische) prijzen uit quality_base_prices.
-- Sales Support levert nu 8 echte prijslijsten per 01.04.2026:
--   0210 Benelux              (vervangt 0150)
--   0211 Benelux + MV         (vervangt 0151)
--   0212 Benelux + bamboe     (vervangt 0152, geen klanten gemapt)
--   0213 Benelux + MV + bamboe (vervangt 0153, geen klanten gemapt)
--   0214 Benelux + RM
--   0215 Benelux + RM + MV
--   0216 Benelux + RM + bamboe
--   0217 Benelux + RM + MV + bamboe
--
-- Deze migratie maakt de 8 headers aan en hermapt klanten op 0150/0151.
-- De prijs-regels worden ingevoerd door de gegenereerde
-- 20260504_price_list_lines_210_217.sql migratie (run die NA deze).
-- ============================================================

-- ─── 1. Headers aanmaken ──────────────────────────────────

INSERT INTO price_lists (nr, name, valid_from, active) VALUES
  ('0210', 'Benelux per 01.04.2026',                     DATE '2026-04-01', true),
  ('0211', 'Benelux + MV per 01.04.2026',                DATE '2026-04-01', true),
  ('0212', 'Benelux + bamboe per 01.04.2026',            DATE '2026-04-01', true),
  ('0213', 'Benelux + MV + bamboe per 01.04.2026',       DATE '2026-04-01', true),
  ('0214', 'Benelux + RM per 01.04.2026',                DATE '2026-04-01', true),
  ('0215', 'Benelux + RM + MV per 01.04.2026',           DATE '2026-04-01', true),
  ('0216', 'Benelux + RM + bamboe per 01.04.2026',       DATE '2026-04-01', true),
  ('0217', 'Benelux + RM + MV + bamboe per 01.04.2026',  DATE '2026-04-01', true)
ON CONFLICT (nr) DO UPDATE SET
  name = EXCLUDED.name,
  valid_from = EXCLUDED.valid_from,
  active = EXCLUDED.active;

-- ─── 2. Klanten hermappen 0150 → 0210, 0151 → 0211 ────────
-- Sales Support email 2026-05-03: nieuwe lijsten vervangen de oude
-- per ingangsdatum 2026-04-01.

UPDATE clients SET price_list_nr = '0210' WHERE price_list_nr = '0150';
UPDATE clients SET price_list_nr = '0211' WHERE price_list_nr = '0151';

-- ─── 3. Oude lijsten deactiveren ─────────────────────────
-- We laten de rows + regels staan voor historische orders/audit, maar
-- de UI filtert op active=true en zal ze niet meer als keuze tonen.

UPDATE price_lists SET active = false WHERE nr IN ('0150', '0151');
