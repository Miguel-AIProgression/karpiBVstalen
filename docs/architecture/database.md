# Database Architectuur

> **Laatst geverifieerd:** 2026-03-20
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
| `locations` | Magazijnlocaties (gangpad/stelling/laag) | 1 |

### Bundels & Collecties (actief)
| Tabel | Doel | Fase |
|-------|------|------|
| `bundles` | Bundelconfiguraties (kwaliteit + maat) | 2 |
| `bundle_colors` | Kleuren per bundel (met positie) | 2 |
| `collections` | Collecties (groepering van bundels) | 2 |
| `collection_bundles` | Koppeling collectie ↔ bundel (many-to-many) | 2 |

### Voorraad & Productie (actief)
| Tabel | Doel | Fase |
|-------|------|------|
| `raw_stock` | Ongesneden/onafgewerkte voorraad | 1 |
| `finished_stock` | Afgewerkte voorraad | 1 |
| `bundle_stock` | Gebundelde voorraad | 2 |
| `cut_batches` | Snijbatches (audit trail) | 1 |
| `finishing_batches` | Afwerkbatches (audit trail) | 1 |
| `bundle_batches` | Bundelbatches (audit trail) | 2 |

### Klanten & Prijzen (tabel bestaat, nog geen frontend)
| Tabel | Doel | Fase |
|-------|------|------|
| `clients` | Klanten met hiërarchie (moeder → vestigingen), incl. `client_number` (ERP-koppeling) | 3 |
| `client_quality_names` | Klant-eigen-namen per kwaliteit (bijv. klant noemt BEACH LIFE → "BREDA") | 3 |
| `client_product_rules` | Productregels per klant (include/exclude) | 3 |
| `client_purchase_prices` | Inkoopprijzen per klant/kwaliteit/afwerking | 3 |
| `client_retail_prices` | Verkoopprijzen per klant/kwaliteit/maat | 3 |

### Ordermanagement (tabel bestaat, nog geen frontend)
| Tabel | Doel | Fase |
|-------|------|------|
| `projects` | Projecten per klant | 4 |
| `bundle_requests` | Bundelaanvragen per project | 4 |
| `bundle_reservations` | Reserveringen op aanvragen | 4 |

### Views
| View | Doel | Status |
|------|------|--------|
| `v_pipeline_status` | Voorraad per product op elk niveau (raw/finished/bundle) | Actief |

### RPC Functions
| Functie | Doel | Status |
|---------|------|--------|
| `get_user_role` | Haal gebruikersrol op uit JWT | Aanwezig, niet in frontend-code |

## Architectuur

### Inventory Pipeline
```
Snijden → raw_stock → Afwerken → finished_stock → Bundelen → bundle_stock
```
- Elke stap heeft een batch-tabel (audit trail): `cut_batches`, `finishing_batches`, `bundle_batches`
- Database triggers updaten voorraadtabellen automatisch bij batch-inserts
- `bundles` + `bundle_colors` = bundelconfiguratie (welke kleuren in welke bundel)

### Productstructuur
- `collections` → `bundles` → `bundle_colors` (hiërarchie)
- `qualities` → `color_codes` (kwaliteit heeft meerdere kleuren)
- `finishing_types` + `quality_finishing_rules` (welke afwerking op welke kwaliteit)
- Een staaltje-variant = kwaliteit + kleurcode + afwerking + maat (niet apart opgeslagen)

### Locaties
- `locations` met gangpad/stelling/laag, auto-generated label
- Elke voorraadtabel heeft `location_id`

### RLS
- Rollen via `app_metadata.role`: `production`, `sales`, `admin`
- Alle authenticated users: leesrechten
- production/admin: batch-inserts
- admin: volledige CRUD op configuratie

## Onderhoudsinstructie

> **Bij elke database-wijziging (nieuwe tabel, kolom, view):**
> 1. Maak een migratie in `supabase/migrations/`
> 2. Update dit bestand (voeg tabel toe aan de juiste sectie + fase)
> 3. Regenereer types: update `src/lib/supabase/types.ts`
> 4. Update de "Laatst geverifieerd" datum bovenaan
