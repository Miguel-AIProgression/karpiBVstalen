# Database Architectuur

> **Laatst geverifieerd:** 2026-05-03
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
| `samples` | Stalen: quality + color + dimension + foto + min_stock + **location** + `article_number` | 1 |

`samples.location` (tekstveld, format `X-00-00`) is de **enige locatiebron** in de UI.
`samples.article_number` (UNIQUE, format `KARPI-{quality_code}-{color_code}-{dim_short}`) is de natuurlijke sleutel waarop prijslijst-regels koppelen.

### Bundels & Collecties (LEGACY — droppen na productie)
| Tabel | Doel | Status |
|-------|------|--------|
| `bundles` | Bundelconfiguraties | Drop in `99999999_drop_legacy_bundles_pricing.sql` |
| `bundle_colors` | Kleuren per bundel | Drop |
| `bundle_items` | Items per bundel | Drop |
| `collections` | Collecties | Drop |
| `collection_bundles` | Koppeling collectie ↔ bundel | Drop |
| `bundle_batches` | Bundelbatches | Drop |
| `bundle_stock` | Gebundelde voorraad | Drop |
| `accessories` / `order_accessories` | Roede / display / etc. per order | Drop |
| `extras` / `extras_stock` | Extra artikelen | Drop |

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

### Klanten & Prijzen (actief — ERP-stijl)
| Tabel | Doel | Status |
|-------|------|--------|
| `clients` | Klanten met `client_number` + `price_list_nr` (FK → price_lists.nr) | Actief |
| `client_quality_names` | Klant-eigen-namen per kwaliteit (BEACH LIFE → "BREDA") | Actief — gebruikt door stickers |
| `price_lists` | Prijslijst-headers (nr / naam / geldig_vanaf / actief) | Actief |
| `price_list_lines` | Prijslijst-regels (price_list_nr + article_number → price_cents) | Actief |
| `client_product_rules` | Productregels per klant | LEGACY — drop |
| `client_purchase_prices` | Inkoopprijzen | LEGACY — drop |
| `client_carpet_prices` | Verkoopprijzen per klant/kwaliteit/maat | LEGACY — drop |
| `quality_base_prices` | Master-prijzen per kwaliteit/tapijtmaat | LEGACY — drop |

### Orders (actief)
| Tabel | Doel | Status |
|-------|------|--------|
| `orders` | Orders met status, leverdatum, verzendadres, sticker-opties (`show_prices_on_sticker`, `sticker_name_type`) | Actief — `collection_id`/`collection_price_cents`/`price_factor` zijn legacy en droppen |
| `order_lines` | Orderregels: één rij per staal (`sample_id` + quantity). `bundle_id` is legacy en dropt | Actief |

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

### Facturatie (juni 2026, creditnota's juli 2026 — mig 20260712)
- **`invoices`**: STL-YYYY-NNN-reeks via `next_invoice_number()` (advisory lock, MAX+1 per jaar). Totalen als cents-snapshot.
- **Creditnota = `invoices`-rij met `credited_invoice_id`** (self-FK, ON DELETE RESTRICT) en **negatieve** bedragen; CHECK `invoices_sign_matches_type` koppelt teken aan type. Zelfde STL-reeks. `credit_reason` optioneel.
- **Partial UNIQUE `invoices_one_debit_per_order`** (`order_id WHERE credited_invoice_id IS NULL`): max één debetfactuur per order — "dé factuur van een order" selecteren = altijd filteren op `credited_invoice_id IS NULL`.
- **`invoice_lines`** = regel-snapshot voor álle nieuwe facturen (order_lines zijn ná facturatie muteerbaar; PDF/mail/CSV renderen snapshot-first via `src/lib/invoice-snapshot.ts`). Kolommen: `line_tag` (Collectie/Bundel/Staal), description, article_number, dimension_name, quantity, unit_price_cents, amount_cents (negatief op credits), position. RLS: SELECT-only voor authenticated; schrijven alleen via service-role-routes. Backfill bestaande facturen: `npx tsx scripts/backfill-invoice-lines.ts` (dry-run; `--apply`).
- **RPC `create_credit_invoice`** (SECURITY DEFINER, REVOKE voor anon/authenticated): drie modi (hele regels / deelcredit per aantal pro-rata / vrij bedrag ±incl-BTW), guards: limiet Σ|credit| ≤ |debet| + €0,01 (FOR UPDATE-geserialiseerd), geen credit-op-credit, geen dubbele regels, aantal ≤ origineel. Client-spiegel van de berekening: `src/lib/credit-calc.ts`.
- **Verwijder-flow (ticket 007):** alléén niet-gemailde facturen zonder creditnota's zijn verwijderbaar, via `DELETE /api/invoices/[id]` (service-role-route, pure guard `src/lib/invoice-delete-guard.ts` → nette 409). De DB dwingt het onomzeilbaar af: BEFORE DELETE-trigger `invoices_no_delete_when_sent` (gemaild → EXCEPTION, ook voor service-role) + FK-RESTRICT op `credited_invoice_id`. De trigger stond al live; sinds deze slice staat de definitie ook als migratie in de repo: `supabase/migrations/20260712_invoices_no_delete_when_sent.sql` (repo↔DB-drift gedicht).
- **Rol-gate:** alle schrijvende facturatie-routes (`create`, `csv`, `email`, `credit`, `[id]`-DELETE) vereisen `sales`/`admin` via `src/lib/auth/require-role.ts` (Bearer of sessie-cookie, 401/403 JSON).
- **RLS-lockdown `invoices` (NOG UIT TE VOEREN):** migratie `supabase/migrations/20260712_invoices_rls_lockdown.sql` vervangt de brede `invoices_auth`-policy (ALL) door SELECT-only voor authenticated — schrijven kan daarna uitsluitend via de service-role-routes. Geschreven maar nog niet toegepast op de live DB.
- **Factuur-PDF (`src/lib/invoice-pdf.ts`):** RugFlow-huisstijl — Courier/typemachine-look, regelgebaseerde layout op absolute mm-posities, punt-decimaal in bedragen (`1234.56`), TRANSPORTEREN/TRANSPORT bij paginabreuk. Tabel-start pagina 1 is dynamisch (`tableHeaderStartY`): een lange credit-"Reden" duwt de tabel omlaag i.p.v. erdoorheen. Klantblok toont het land (uppercase) alléén als het afwijkt van NL/Nederland. Preview zonder DB: `npx tsx scripts/_pdf-preview.mts`.
- **Werkblad `/facturatie`:** facturenlijst (debet + credit) met filters/sortering + AFAS-CSV-export (verhuisd van de orders-pagina; alleen debetfacturen selecteerbaar). Lijst-query geplafonneerd op 2000 rijen, nieuwste eerst.
- **AFAS-CSV-formaat (13-07, feedback Nando):** één rij per factuur in de kolomvolgorde van de RugFlow-verkoopoverzicht-export: `Debiteur;Naam1;Naam2;Adres;Postcode;Woonplaats;Land;Ordernummer;Klant ref;Factuurnr;Datum;Verv.datum;Bedrag ex;BTW bedrag;Totaal`. Omschrijving/BTW-code vervallen; Naam2 blijft leeg (geen inkoopgroep); Nederland → lege Land-kolom; vervaldatum = factuurdatum + `company_settings.payment_days`. Pure opbouw + tests: `src/lib/afas-csv.ts`.
- **E-mail: ontvanger zichtbaar + kiesbaar (13-07):** de mail-route accepteert `to` (override; leeg = clientEmail-keten `orders.email_invoice → clients.email_invoice → orders.email → clients.contact_email`) en registreert `invoices.sent_to` naast `sent_at`. UI: mail-knoppen openen eerst een paneel met het vooringevulde, aanpasbare adres (InvoiceModal + CreditDialog).
- **`invoice_events` (mig 20260713_invoice_events_sent_to.sql):** append-only factuurgeschiedenis (`aangemaakt`/`gemaild`/`creditnota_aangemaakt`/`vervangen`, actor_email + details-jsonb). Schrijven alleen via service-role-routes (`src/lib/invoice-events.ts`, best-effort); authenticated leest (Geschiedenis-sectie in de InvoiceModal). Backfill uit created_at/sent_at/credit-koppeling zit in de migratie. **Deploy-volgorde: migratie vóór de code** — de mail-route schrijft `sent_to` en zou anders de `sent_at`-update laten falen.

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
