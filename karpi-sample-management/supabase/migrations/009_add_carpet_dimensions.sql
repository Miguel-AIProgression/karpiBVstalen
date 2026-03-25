CREATE TABLE IF NOT EXISTS carpet_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  width_cm integer NOT NULL,
  height_cm integer NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quality_carpet_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_id uuid NOT NULL REFERENCES qualities(id),
  carpet_dimension_id uuid NOT NULL REFERENCES carpet_dimensions(id),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (quality_id, carpet_dimension_id)
);

CREATE TABLE IF NOT EXISTS client_carpet_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  quality_id uuid NOT NULL REFERENCES qualities(id),
  carpet_dimension_id uuid REFERENCES carpet_dimensions(id),
  price_cents integer NOT NULL,
  unit text NOT NULL DEFAULT 'piece' CHECK (unit IN ('piece', 'm2')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (client_id, quality_id, carpet_dimension_id)
);

CREATE INDEX idx_quality_carpet_dims ON quality_carpet_dimensions(quality_id);
CREATE INDEX idx_client_carpet_prices_client ON client_carpet_prices(client_id);
CREATE INDEX idx_client_carpet_prices_quality ON client_carpet_prices(quality_id);

ALTER TABLE carpet_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_carpet_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_carpet_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carpet_dimensions_select" ON carpet_dimensions FOR SELECT TO authenticated USING (true);
CREATE POLICY "quality_carpet_dimensions_select" ON quality_carpet_dimensions FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_carpet_prices_select" ON client_carpet_prices FOR SELECT TO authenticated USING (true);

CREATE POLICY "carpet_dimensions_admin" ON carpet_dimensions FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

CREATE POLICY "quality_carpet_dimensions_admin" ON quality_carpet_dimensions FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'));

CREATE POLICY "client_carpet_prices_admin" ON client_carpet_prices FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('sales', 'admin'));

INSERT INTO carpet_dimensions (width_cm, height_cm, name) VALUES
  (80, 150, '080×150'),
  (130, 190, '130×190'),
  (160, 230, '160×230'),
  (200, 290, '200×290'),
  (240, 330, '240×330');
