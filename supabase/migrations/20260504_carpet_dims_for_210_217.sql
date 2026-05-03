-- ============================================================
-- Carpet dimensions toegevoegd voor prijslijst-import 0210-0217
-- ============================================================
-- Tijdens analyse van de 8 nieuwe Benelux-prijslijsten zijn 4 dim-namen
-- gevonden die nog niet in carpet_dimensions stonden. Deze migratie voegt
-- ze toe zodat de lines-import in 20260504_price_list_lines_210_217.sql
-- kan joinen op carpet_dimensions.name.
--
-- NB: carpet_dimensions.name heeft geen UNIQUE constraint, dus ON CONFLICT
-- werkt niet. We gebruiken WHERE NOT EXISTS voor idempotency — re-run is
-- veilig en levert geen duplicaten op.
-- ============================================================

INSERT INTO carpet_dimensions (width_cm, height_cm, name, active)
SELECT v.width_cm, v.height_cm, v.name, v.active
FROM (VALUES
  (150, 150, '150 ROND',          true),
  (350, 350, '350 ROND',          true),
  (275, 400, '275x400',           true),
  (240, 340, '240x340 organisch', true)
) AS v(width_cm, height_cm, name, active)
WHERE NOT EXISTS (
  SELECT 1 FROM carpet_dimensions cd WHERE cd.name = v.name
);
