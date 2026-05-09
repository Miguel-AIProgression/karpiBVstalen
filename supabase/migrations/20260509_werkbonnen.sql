-- Werkbonnen: productieopdrachten aangemaakt vanuit orders
CREATE TABLE werkbonnen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'open',  -- open, completed
  notes text
);

CREATE TABLE werkbon_orders (
  werkbon_id uuid NOT NULL REFERENCES werkbonnen(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_number text,
  PRIMARY KEY (werkbon_id, order_id)
);

CREATE TABLE werkbon_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  werkbon_id uuid NOT NULL REFERENCES werkbonnen(id) ON DELETE CASCADE,
  sample_id uuid REFERENCES samples(id),
  quality_id uuid,
  color_code_id uuid,
  dimension_id uuid,
  bundle_id uuid,
  collection_name text,
  bundle_name text,
  article_number text NOT NULL,
  quality_name text,
  color_code text,
  dimension_name text,
  afwerking text,
  location text,
  to_produce integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open',  -- open, gereed
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE werkbonnen ENABLE ROW LEVEL SECURITY;
ALTER TABLE werkbon_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE werkbon_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY werkbonnen_auth ON werkbonnen FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY werkbon_orders_auth ON werkbon_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY werkbon_lines_auth ON werkbon_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
