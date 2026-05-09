ALTER TABLE samples ADD COLUMN IF NOT EXISTS finishing_type_id uuid REFERENCES finishing_types(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_samples_finishing_type_id ON samples(finishing_type_id);
