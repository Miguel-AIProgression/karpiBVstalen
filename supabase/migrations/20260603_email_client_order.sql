-- Email op klant-niveau (standaard voor nieuwe orders)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email text;

-- Email op order-niveau (kan afwijken van klant-email)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email text;
