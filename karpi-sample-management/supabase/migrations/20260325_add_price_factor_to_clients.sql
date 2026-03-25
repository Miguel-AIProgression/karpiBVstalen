-- Add price_factor column to clients table
-- This stores the default price multiplier for calculating client prices from base prices
ALTER TABLE clients ADD COLUMN IF NOT EXISTS price_factor numeric DEFAULT 2.5;
