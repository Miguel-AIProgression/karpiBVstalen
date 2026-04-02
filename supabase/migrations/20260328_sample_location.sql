-- Add location field to samples table
-- Format: letter-2digits-2digits (e.g. A-01-02)
ALTER TABLE samples ADD COLUMN location text;

-- Optional: add a check constraint for the format
ALTER TABLE samples ADD CONSTRAINT samples_location_format
  CHECK (location IS NULL OR location ~ '^[A-Z]-[0-9]{2}-[0-9]{2}$');
