-- Verplaats "Toeslag organische vormen" van Roede & Display naar Overige accessoires
-- Door type te wijzigen van 'display' naar 'toeslag'

-- Constraint uitbreiden met 'toeslag'
ALTER TABLE accessories DROP CONSTRAINT IF EXISTS accessories_type_check;
ALTER TABLE accessories ADD CONSTRAINT accessories_type_check
  CHECK (type IN ('roede', 'display', 'anti_slip', 'plush_product', 'staal', 'toeslag'));

-- Type wijzigen
UPDATE accessories SET type = 'toeslag' WHERE name = 'Toeslag organische vormen';

-- Als het record nog niet bestaat, insert het
INSERT INTO accessories (name, type, default_price_cents, active)
SELECT 'Toeslag organische vormen', 'toeslag', 7500, true
WHERE NOT EXISTS (
  SELECT 1 FROM accessories WHERE name = 'Toeslag organische vormen'
);
