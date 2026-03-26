-- Voeg price_factor toe aan orders zodat stickers de juiste prijs kunnen berekenen
ALTER TABLE orders ADD COLUMN IF NOT EXISTS price_factor numeric(4,2) DEFAULT 2.5;

-- Voeg excluded_dimensions toe (JSON array van "qualityId:dimensionName" strings)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS excluded_dimensions jsonb DEFAULT '[]'::jsonb;
