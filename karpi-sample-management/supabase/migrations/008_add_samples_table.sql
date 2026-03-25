-- Materialize samples as first-class entities
CREATE TABLE IF NOT EXISTS samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_id uuid NOT NULL REFERENCES qualities(id),
  color_code_id uuid NOT NULL REFERENCES color_codes(id),
  dimension_id uuid NOT NULL REFERENCES sample_dimensions(id),
  photo_url text,
  description text,
  min_stock integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quality_id, color_code_id, dimension_id)
);

CREATE INDEX idx_samples_quality ON samples(quality_id);
CREATE INDEX idx_samples_active ON samples(active) WHERE active = true;

ALTER TABLE samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "samples_select" ON samples FOR SELECT TO authenticated USING (true);

CREATE POLICY "samples_insert" ON samples FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('production', 'admin'));

CREATE POLICY "samples_update" ON samples FOR UPDATE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('production', 'admin'));
