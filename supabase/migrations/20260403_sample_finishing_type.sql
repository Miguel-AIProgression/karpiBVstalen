-- Add finishing_type_id to samples table
-- This allows tracking samples with different finishing types separately
-- e.g. Dante 12 40x25 with standard band vs Dante 12 40x25 with Riviera band

ALTER TABLE samples ADD COLUMN finishing_type_id uuid REFERENCES finishing_types(id) ON DELETE SET NULL;

-- Update the unique constraint if it exists (quality + color + dimension must now also consider finishing)
-- First drop old unique constraint if present
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_quality_color_dimension_unique;

-- Add new unique constraint including finishing_type_id
ALTER TABLE samples ADD CONSTRAINT samples_quality_color_dimension_finishing_unique
  UNIQUE (quality_id, color_code_id, dimension_id, finishing_type_id);
