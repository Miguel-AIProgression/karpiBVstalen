-- Verkoopprijzen vastleggen op orders
-- company_settings: vaste staalprijs voor losse stalen
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sample_price_cents integer;
-- order_lines: factuurprijs vastgelegd op moment van bestelling
ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS price_cents integer;
