# Database Architectuur

> **Laatst geverifieerd:** 2026-03-30
> Bij elke database-wijziging: update dit bestand + `src/lib/supabase/types.ts`

## Tabeloverzicht

### Productconfiguratie (actief)
| Tabel | Doel | Fase |
|-------|------|------|
| `qualities` | Kwaliteiten/materialen (bijv. tapijt-types) | 1 |
| `color_codes` | Kleuren per kwaliteit | 1 |
| `sample_dimensions` | Staaltje-afmetingen (breedte × hoogte) | 1 |
| `finishing_types` | Afwerkingstypes (bijv. overlocking) | 1 |
| `quality_finishing_rules` | Welke afwerking op welke kwaliteit mag | 1 |

### Samples (actief — kern van het systeem)
| Tabel | Doel | Fase |
|-------|------|------|
| `samples` | Stalen: quality + color + dimension + foto + min_stock + **location** | 1 |

`samples.location` (tekstveld, format `X-00-00`) is de **enige locatiebron** in de UI.

### Bundels & Collecties (actief)
| Tabel | Doel | Fase |
|-------|------|------|
| `bundles` | Bundelconfiguraties (kwaliteit + maat) | 2 |
| `bundle_colors` | Kleuren per bundel (met positie) | 2 |
| `bundle_items` | Items per bundel (voor multi-quality bundels) | 2 |
| `collections` | Collecties (groepering van bundels) | 2 |
| `collection_bundles` | Koppeling collectie ↔ bundel (many-to-many) | 2 |

### Voorraad (actief)
| Tabel | Doel | Status |
|-------|------|--------|
| `finished_stock` | Afgewerkte voorraad (hoeveelheden) | Actief — `location_id` wordt niet meer gelezen door UI |
| `bundle_stock` | Gebundelde voorraad (hoeveelheden) | Actief — `location_id` wordt niet meer gelezen door UI |
| `locations` | Magazijnlocaties (gangpad/stelling/laag) | Legacy — alleen als FK target voor stock-tabellen |
| `raw_stock` | Ongesneden voorraad | Legacy — niet meer gelezen door UI |

### Audit trail (actief)
| Tabel | Doel | Fase |
|-------|------|------|
| `cut_batches` | Snijbatches | 1 |
| `finishing_batches` | Afwerkbatches | 1 |
| `bundle_batches` | Bundelbatches | 2 |

### Klanten & Prijzen (actief)
| Tabel | Doel | Fase |
|-------|------|------|
| `clients` | Klanten met hiërarchie (moeder → vestigingen), incl. `client_number` (ERP-koppeling) | 3 |
| `client_quality_names` | Klant-eigen-namen per kwaliteit (bijv. klant noemt BEACH LIFE → "BREDA") | 3 |
| `client_product_rules` | Productregels per klant (include/exclude) | 3 |
| `client_purchase_prices` | Inkoopprijzen per klant/kwaliteit/afwerking | 3 |
| `client_retail_prices` | Verkoopprijzen per klant/kwaliteit/maat | 3 |

### Orders (actief)
| Tabel | Doel | Fase |
|-------|------|------|
| `orders` | Orders met status, leverdatum, verzendadres | 4 |
| `order_lines` | Orderregels (bundle + quantity) | 4 |
| `order_accessories` | Accessoires per order | 4 |
| `accessories` | Accessoire-definities | 4 |
| `extras` | Extra artikelen | 4 |
| `extras_stock` | Voorraad van extra artikelen | 4 |

### Views
| View | Doel | Status |
|------|------|--------|
| `v_pipeline_status` | Voorraad per bundel/kleur (finished + bundle stock + sample_location) | Actief |

### RPC Functions
| Functie | Doel | Status |
|---------|------|--------|
| `get_user_role` | Haal gebruikersrol op uit JWT | Aanwezig, niet in frontend-code |

## Architectuur

### Voorraadmodel (vereenvoudigd maart 2026)
- **`samples.location`** = enige locatiebron (tekstveld `X-00-00`, bijv. `B-33-34`)
- **`finished_stock`** = hoeveelheden afgewerkte stalen (geaggregeerd per quality+color+dimension)
- **`bundle_stock`** = hoeveelheden gebundelde stalen
- De `location_id` FK op stock-tabellen wordt niet meer actief gelezen door de UI
- Quick-entry en finishing schrijven direct naar `finished_stock` met een vaste default `location_id`

### Productstructuur
- `collections` → `bundles` → `bundle_colors` / `bundle_items` (hiërarchie)
- `qualities` → `color_codes` (kwaliteit heeft meerdere kleuren)
- `finishing_types` + `quality_finishing_rules` (welke afwerking op welke kwaliteit)
- Een staaltje = `samples` rij met quality + kleurcode + maat + locatie

### RLS
- Rollen via `app_metadata.role`: `production`, `sales`, `admin`
- Alle authenticated users: leesrechten
- production/admin: stock-writes
- admin: volledige CRUD op configuratie

## Onderhoudsinstructie

> **Bij elke database-wijziging (nieuwe tabel, kolom, view):**
> 1. Maak een migratie in `supabase/migrations/`
> 2. Update dit bestand (voeg tabel toe aan de juiste sectie + fase)
> 3. Regenereer types: update `src/lib/supabase/types.ts`
> 4. Update de "Laatst geverifieerd" datum bovenaan
