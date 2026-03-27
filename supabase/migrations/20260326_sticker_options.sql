-- Sticker opties: naam type (karpi/klant) en prijzen ja/nee
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sticker_name_type text DEFAULT 'karpi' CHECK (sticker_name_type IN ('karpi', 'client'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS show_prices_on_sticker boolean DEFAULT true;
