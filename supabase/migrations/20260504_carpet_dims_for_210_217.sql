-- ============================================================
-- Carpet dimensions toegevoegd voor prijslijst-import 0210-0217
-- ============================================================
-- Tijdens analyse van de 8 nieuwe Benelux-prijslijsten zijn 4 dim-namen
-- gevonden die nog niet in carpet_dimensions stonden. Deze migratie voegt
-- ze toe zodat de lines-import in 20260504_price_list_lines_210_217.sql
-- kan joinen op carpet_dimensions.name.
-- ============================================================

INSERT INTO carpet_dimensions (width_cm, height_cm, name, active) VALUES
  (150, 150, '150 ROND',          true),
  (350, 350, '350 ROND',          true),
  (275, 400, '275x400',           true),
  (240, 340, '240x340 organisch', true)
ON CONFLICT DO NOTHING;
