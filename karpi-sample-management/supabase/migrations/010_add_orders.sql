CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS text AS $$
DECLARE
  year_str text;
  next_num integer;
BEGIN
  year_str := to_char(now(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM '#' || year_str || '-(\d+)') AS integer)
  ), 0) + 1
  INTO next_num
  FROM orders
  WHERE order_number LIKE '#' || year_str || '-%';
  RETURN '#' || year_str || '-' || lpad(next_num::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT generate_order_number(),
  client_id uuid NOT NULL REFERENCES clients(id),
  collection_id uuid NOT NULL REFERENCES collections(id),
  delivery_date date NOT NULL,
  status text NOT NULL DEFAULT 'restock_needed'
    CHECK (status IN ('picking_ready', 'restock_needed', 'completed')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  bundle_id uuid NOT NULL REFERENCES bundles(id),
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_client ON orders(client_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_delivery ON orders(delivery_date);
CREATE INDEX idx_order_lines_order ON order_lines(order_id);
CREATE INDEX idx_order_lines_bundle ON order_lines(bundle_id);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "order_lines_select" ON order_lines FOR SELECT TO authenticated USING (true);

CREATE POLICY "orders_insert" ON orders FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'));
CREATE POLICY "orders_update" ON orders FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'));

CREATE POLICY "order_lines_insert" ON order_lines FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'));
CREATE POLICY "order_lines_update" ON order_lines FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'));
CREATE POLICY "order_lines_delete" ON order_lines FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'));

CREATE OR REPLACE FUNCTION populate_order_lines()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO order_lines (order_id, bundle_id, quantity)
  SELECT NEW.id, cb.bundle_id, 1
  FROM collection_bundles cb
  WHERE cb.collection_id = NEW.collection_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_populate_order_lines
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION populate_order_lines();
