-- Accessoires tabel (roede, display, etc.)
CREATE TABLE IF NOT EXISTS accessories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('roede', 'display')),
  default_price_cents integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Order accessoires (welke accessoires bij een order horen)
CREATE TABLE IF NOT EXISTS order_accessories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  accessory_id uuid NOT NULL REFERENCES accessories(id),
  quantity integer NOT NULL DEFAULT 1,
  price_cents integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Seed standaard accessoires
INSERT INTO accessories (name, type, default_price_cents) VALUES
  ('Roede', 'roede', 6500),
  ('Display', 'display', 75000);

-- RLS policies
ALTER TABLE accessories ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_accessories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read accessories"
  ON accessories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage accessories"
  ON accessories FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read order_accessories"
  ON order_accessories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage order_accessories"
  ON order_accessories FOR ALL TO authenticated USING (true) WITH CHECK (true);
