-- ============================================================
-- Drop legacy bundles, collecties, accessoires en oude prijs-tabellen
-- ============================================================
-- ⚠️  PAS UITVOEREN NA SUCCESVOLLE PRODUCTIE-DEPLOY EN VERIFICATIEPERIODE.
--
-- Voorwaarden:
--   • Migratie 20260503_price_lists.sql is uitgevoerd op productie.
--   • Migratie 20260503_order_lines_sample_id.sql is uitgevoerd, alle
--     order_lines hebben sample_id ingevuld (geen rijen meer met alleen bundle_id).
--   • Stickers, orders en productie werken correct ≥ 1 week.
--   • Supabase backup of branch is aangemaakt.
--
-- Verifieer voor de drop:
--   SELECT COUNT(*) FROM order_lines WHERE bundle_id IS NOT NULL AND sample_id IS NULL;
--   → moet 0 zijn.
-- ============================================================

-- ─── Stap 1 — Drop kolommen uit bestaande tabellen ───────

ALTER TABLE orders      DROP COLUMN IF EXISTS collection_id;
ALTER TABLE orders      DROP COLUMN IF EXISTS collection_price_cents;
ALTER TABLE orders      DROP COLUMN IF EXISTS price_factor;
ALTER TABLE order_lines DROP COLUMN IF EXISTS bundle_id;

-- ─── Stap 2 — Drop bundel/collectie/accessoire/extras-tabellen ─

-- Eerst de view die naar deze tabellen verwijst
DROP VIEW IF EXISTS v_pipeline_status;

-- Dan tabellen met FK's naar bundles/collections/etc.
DROP TABLE IF EXISTS bundle_batches    CASCADE;
DROP TABLE IF EXISTS bundle_stock      CASCADE;
DROP TABLE IF EXISTS bundle_colors     CASCADE;
DROP TABLE IF EXISTS bundle_items      CASCADE;
DROP TABLE IF EXISTS collection_bundles CASCADE;
DROP TABLE IF EXISTS order_accessories CASCADE;
DROP TABLE IF EXISTS extras_stock      CASCADE;

-- Parent-tabellen
DROP TABLE IF EXISTS bundles      CASCADE;
DROP TABLE IF EXISTS collections  CASCADE;
DROP TABLE IF EXISTS accessories  CASCADE;
DROP TABLE IF EXISTS extras       CASCADE;

-- ─── Stap 3 — Drop oude prijs-tabellen ───────────────────
-- Vervangen door price_lists + price_list_lines

DROP TABLE IF EXISTS client_carpet_prices  CASCADE;
DROP TABLE IF EXISTS quality_base_prices   CASCADE;
DROP TABLE IF EXISTS client_purchase_prices CASCADE;
DROP TABLE IF EXISTS client_product_rules  CASCADE;

-- ─── Stap 4 — Optioneel: legacy zonder gebruik ───────────

DROP TABLE IF EXISTS raw_stock                CASCADE;
-- quality_carpet_dimensions is alleen door oude prijs-editor gebruikt
DROP TABLE IF EXISTS quality_carpet_dimensions CASCADE;

-- ⚠️  carpet_dimensions / cut_batches / finishing_batches / locations / client_quality_names BLIJVEN.
--     - carpet_dimensions: kan nog worden gebruikt voor productinformatie
--     - cut_batches / finishing_batches: audit-trail historie
--     - locations: nog FK-target voor finished_stock
--     - client_quality_names: stickers gebruiken dit voor klant-eigen kwaliteitsnamen
