-- ════════════════════════════════════════════════════════════════
-- Migration: Prijzen en maat-koppelingen legen
-- Verkeerde prijslijst was geïmporteerd.
-- Kwaliteiten en afmetingen zelf blijven behouden.
-- ════════════════════════════════════════════════════════════════

-- Alle prijzen uit quality_base_prices verwijderen
DELETE FROM quality_base_prices;

-- Alle kwaliteit-afmeting koppelingen verwijderen
DELETE FROM quality_carpet_dimensions;

-- base_price op qualities resetten naar NULL
UPDATE qualities SET base_price = NULL WHERE base_price IS NOT NULL;
