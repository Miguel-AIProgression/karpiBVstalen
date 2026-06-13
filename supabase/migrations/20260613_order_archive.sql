-- Archivering van gefactureerde orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS orders_archived_at_idx ON orders (archived_at) WHERE archived_at IS NOT NULL;
