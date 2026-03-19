# Database Architectuur

## Productstructuur
- `collections` → `qualities` → `color_codes` (hiërarchie)
- `finishing_types` + `quality_finishing_rules` (welke afwerking op welke kwaliteit)
- `sample_dimensions` (maatvoering)
- Een staaltje-variant = kwaliteit + kleurcode + afwerking + maat (niet apart opgeslagen)

## Inventory Pipeline (3 niveaus)
```
Snijden → raw_stock → Afwerken → finished_stock → Bundelen → bundle_stock
```
- Elke stap heeft een batch-tabel (audit trail): `cut_batches`, `finishing_batches`, `bundle_batches`
- Database triggers updaten voorraadtabellen automatisch bij batch-inserts
- `bundle_configs` + `bundle_config_items` = bundel-samenstelling (standaard of per klant)

## Locaties
- `locations` met gangpad/stelling/laag, auto-generated label
- Elke voorraadtabel heeft `location_id`

## Klanten & Prijzen (schema aanwezig, CRUD-frontend in latere fase)
- `clients` (self-referencing hiërarchie: moederorganisatie → vestigingen)
- `client_purchase_prices` / `client_retail_prices` / `client_product_rules`

## Views
- `v_pipeline_status` — voorraad per product op elk niveau
- `v_bundle_availability` — bundels klaar + maakbaar
- `v_restock_needed` — items onder drempel
- `v_client_catalog` — beschikbare producten per klant

## RLS
- Rollen via `app_metadata.role`: `production`, `sales`, `admin`
- Alle authenticated users: leesrechten
- production/admin: batch-inserts
- admin: volledige CRUD op configuratie
