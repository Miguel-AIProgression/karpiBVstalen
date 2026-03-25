-- Task 1: Create client_addresses table
CREATE TABLE IF NOT EXISTS client_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Hoofdadres',
  street text,
  postal_code text,
  city text,
  country text DEFAULT 'Nederland',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_addresses_client_id ON client_addresses(client_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_addresses_primary
  ON client_addresses(client_id) WHERE is_primary = true;

ALTER TABLE client_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read client_addresses"
  ON client_addresses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert client_addresses"
  ON client_addresses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update client_addresses"
  ON client_addresses FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete client_addresses"
  ON client_addresses FOR DELETE
  TO authenticated
  USING (true);

-- Task 2: Add price_cents to collections
ALTER TABLE collections ADD COLUMN IF NOT EXISTS price_cents integer;

-- Task 3: Add shipping address + price to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_street text,
  ADD COLUMN IF NOT EXISTS shipping_postal_code text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_country text,
  ADD COLUMN IF NOT EXISTS collection_price_cents integer;
