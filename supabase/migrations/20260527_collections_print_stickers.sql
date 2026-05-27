-- Voeg print_stickers vlag toe aan collections (default true = wel stickers)
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS print_stickers boolean NOT NULL DEFAULT true;

-- Collecties waarvoor nooit stickers nodig zijn
UPDATE collections SET print_stickers = false
  WHERE name ILIKE '%Riviera Maison%';

UPDATE collections SET print_stickers = false
  WHERE name ILIKE '%Mart Visser%';
