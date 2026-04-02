# Karpi BV — Staaltjesbeheer Systeem

## Scope: Fase 1+2 — Productstructuur & Voorraadbeheer

**Datum:** 2026-03-19
**Status:** Draft

---

## 1. Context & Probleem

Karpi BV levert tapijten (op maat/afgewerkt) als groothandel aan diverse partijen en heeft een tak voor particulieren. Het huidige systeem voor staaltjesbeheer (Excel/DOS) biedt geen real-time inzicht in voorraad en locatie. Hierdoor werkt het team reactief in plaats van proactief.

### Doelen

- Centraal overzicht van alle staaltjes, hun status en locatie
- Real-time inzicht in voorraad op drie niveaus (gesneden, afgewerkt, bundels)
- Verkoop kan direct zien hoeveel bundels leverbaar zijn en wanneer
- Modulair opgebouwd zodat toekomstige fases (orders, automatisering, stickers) eenvoudig toe te voegen zijn

### Gebruikers

- **Primair:** Productie-team (snijden, afwerken, bundelen) en Verkoop-team (beschikbaarheid, levertijden)
- **Secundair:** Management (overzicht, KPI's, klant/prijsbeheer)
- **Max ~10 gelijktijdige gebruikers**

### Toekomstige fases (buiten scope, wel rekening mee houden)

1. Bundel-configuratie & klantbeheer (klant-specifieke bundels, prijzen, stickers)
2. Ordermanagement (orderinvoer, validatie, statusflow)
3. Productie & planning (capaciteit, productietijden)
4. Automatisering inkomende orders (mail/formulier/API → order)
5. Gereedmelding & facturatie-export
6. Meldingen & drempelwaarden
7. Self-service portal voor klanten (individuele staaltjes)

---

## 2. Tech Stack

| Laag | Technologie | Waarom |
|------|------------|--------|
| Database | Supabase (PostgreSQL) | Realtime, RLS, Auth, Storage in één platform |
| Auth | Supabase Auth | Gebruikersbeheer met rolgebaseerde toegang |
| Realtime | Supabase Realtime | Live voorraad-updates zonder extra infra |
| Storage | Supabase Storage | Klantlogo's (voor latere sticker-generatie) |
| Frontend | Next.js 14+ (App Router) | React-based, SSR, TypeScript |
| Styling | Tailwind CSS + shadcn/ui | Snel te bouwen, consistente UI |
| Hosting | Vercel | Eenvoudige deployment, past bij Next.js |
| Complexe logica | Supabase Edge Functions | Alleen voor levertijd-berekeningen e.d. |

**Supabase plan:** Free of Pro tier (ruim voldoende voor ~10 gebruikers).

---

## 3. Datamodel

### 3.1 Productstructuur

```
collections
├── id (PK)
├── name                    -- Bijv. "Milano", "Venetië"
├── description
└── active (bool)

qualities
├── id (PK)
├── collection_id (FK)      → collections
├── code                    -- Afkorting, bijv. "AEST", "ESSE", "VELV"
├── name                    -- Bijv. "Milano Velour", "Milano Bouclé"
├── material_type
└── base_price (decimal)

color_codes
├── id (PK)
├── quality_id (FK)         → qualities
├── code                    -- Bijv. "001", "002"
├── name                    -- Bijv. "Ivoor", "Antraciet"
└── hex_color (optional)    -- Voor UI kleurweergave

finishing_types
├── id (PK)
├── name                    -- Bijv. "Blindzoom", "Overlocking", "Tape"
├── description
└── production_time_min     -- Minuten per staaltje

quality_finishing_rules
├── id (PK)
├── quality_id (FK)         → qualities
├── finishing_type_id (FK)  → finishing_types
└── is_allowed (bool)       -- Technische regel: kan dit?

sample_dimensions
├── id (PK)
├── width_cm
├── height_cm
└── name                    -- Bijv. "Klein (20x20)", "Groot (40x60)"
```

**Kernprincipe:** Een staaltje-variant is de combinatie van `kwaliteit + kleurcode + afwerking + maat`. We slaan niet elke variant apart op, maar berekenen mogelijke varianten uit de regels.

### 3.2 Voorraadbeheer — Pipeline

De pipeline heeft drie voorraadniveaus met batches die de overgang registreren:

```
cut_batches                         -- Snij-opdracht
├── id (PK)
├── quality_id (FK)                 → qualities
├── color_code_id (FK)              → color_codes
├── dimension_id (FK)               → sample_dimensions
├── quantity
├── cut_date (timestamptz)
└── cut_by (FK)                     → auth.users

raw_stock                           -- Voorraad: gesneden, niet afgewerkt
├── quality_id (FK)                 → qualities
├── color_code_id (FK)              → color_codes
├── dimension_id (FK)               → sample_dimensions
├── quantity                        -- Bijgewerkt via triggers
└── location_id (FK)                → locations
    (composite PK: quality_id + color_code_id + dimension_id + location_id)

finishing_batches                    -- Afwerk-opdracht
├── id (PK)
├── quality_id (FK)                 → qualities
├── color_code_id (FK)              → color_codes
├── dimension_id (FK)               → sample_dimensions
├── finishing_type_id (FK)          → finishing_types
├── quantity
├── started_at (timestamptz)
├── finished_at (timestamptz)
└── finished_by (FK)                → auth.users

finished_stock                      -- Voorraad: afgewerkt (grijpvoorraad)
├── quality_id (FK)                 → qualities
├── color_code_id (FK)              → color_codes
├── dimension_id (FK)               → sample_dimensions
├── finishing_type_id (FK)          → finishing_types
├── quantity                        -- Bijgewerkt via triggers
└── location_id (FK)                → locations
    (composite PK: quality_id + color_code_id + dimension_id +
                   finishing_type_id + location_id)

bundle_configs                      -- Bundel-samenstelling (template)
├── id (PK)
├── name                            -- Bijv. "Milano Standaard Set"
├── client_id (FK, nullable)        → clients (NULL = standaard)
└── is_template (bool)

bundle_config_items                 -- Wat zit in de bundel
├── id (PK)
├── bundle_config_id (FK)           → bundle_configs
├── quality_id (FK)                 → qualities
├── color_code_id (FK, nullable)    -- NULL = alle kleuren
├── finishing_type_id (FK)          → finishing_types
├── dimension_id (FK)               → sample_dimensions
└── quantity                        -- Hoeveel van dit staaltje per bundel

bundle_batches                      -- Bundel-opdracht (audit trail)
├── id (PK)
├── bundle_config_id (FK)           → bundle_configs
├── quantity                        -- Hoeveel bundels samengesteld
├── assembled_at (timestamptz)
└── assembled_by (FK)               → auth.users

bundle_stock                        -- Voorraad: complete bundels
├── bundle_config_id (FK)           → bundle_configs
├── quantity
└── location_id (FK)                → locations
```

**Triggers:** Bij het registreren van een `cut_batch` wordt `raw_stock` automatisch verhoogd. Bij een `finishing_batch` wordt `raw_stock` verlaagd en `finished_stock` verhoogd. Bij een `bundle_batch` wordt `finished_stock` verlaagd en `bundle_stock` verhoogd. Elke batch-tabel dient als audit trail (wie, wanneer, hoeveel).

### 3.3 Locatiebeheer

```
locations
├── id (PK)
├── warehouse_id (nullable)     -- Voor later: meerdere magazijnen
├── aisle                       -- Gangpad
├── rack                        -- Stelling
├── level                       -- Laag
└── label                       -- Gegenereerd: "A3-R2-L1"
```

Elke voorraadtabel (`raw_stock`, `finished_stock`, `bundle_stock`) heeft een `location_id`.

### 3.4 Klanten & Prijzen (schema in fase 1+2, CRUD-frontend in fase 3)

```
clients
├── id (PK)
├── parent_client_id (FK, nullable) → clients (self-ref)
├── name
├── client_type                     -- "wholesaler" / "retailer" / "consumer"
├── contact_email
├── logo_url                        -- Voor stickers (later)
├── sticker_text (nullable)         -- Optionele extra tekst
└── active (bool)

client_purchase_prices              -- Inkoopprijs (klant betaalt aan Karpi)
├── id (PK)
├── client_id (FK)                  → clients
├── quality_id (FK)                 → qualities
├── finishing_type_id (FK, nullable)→ finishing_types
├── price (decimal)
├── valid_from (date)
└── valid_until (date, nullable)

client_retail_prices                -- Verkoopprijs (voor op sticker)
├── id (PK)
├── client_id (FK)                  → clients
├── quality_id (FK)                 → qualities
├── dimension_id (FK)               → sample_dimensions
├── price (decimal)
└── price_per                       -- "piece" / "m2"

client_product_rules                -- Commerciële regels
├── id (PK)
├── client_id (FK)                  → clients
├── quality_id (FK)                 → qualities
├── finishing_type_id (FK, nullable)→ finishing_types
└── rule_type                       -- "allow" / "deny"
```

**Prijslogica:** Fallback naar `qualities.base_price` als er geen klant-specifieke inkoopprijs is. Vestigingen erven prijzen/regels van hun moederorganisatie.

**Commerciële regels:** Standaard mag een klant alles wat technisch kan. Bij minstens één "allow"-regel mag de klant alleen wat expliciet is toegestaan.

---

## 4. Database Views

Slimme views die de pipeline-doorkijk mogelijk maken:

| View | Doel |
|------|------|
| `v_pipeline_status` | Per kwaliteit+kleur+afwerking: hoeveel gesneden, afgewerkt, gebundeld |
| `v_bundle_availability` | Per bundel-configuratie: hoeveel klaar, hoeveel maakbaar uit huidige voorraad |
| `v_restock_needed` | Welke combinaties onder een (configureerbaar) minimum zitten |
| `v_client_catalog` | Per klant: welke producten beschikbaar (technische + commerciële regels) |

---

## 5. Gebruikersrollen & Toegang

Drie rollen via Supabase Auth + RLS:

| Rol | Kan |
|-----|-----|
| **production** | Snij/afwerk/bundel-batches registreren, locaties beheren, eigen voorraad-dashboard |
| **sales** | Bundel-voorraad bekijken, levertijd opvragen, pipeline-doorkijk, klantprijzen bekijken |
| **admin** | Alles + klanten/prijzen beheren, bundel-configuraties maken, commerciële regels, KPI's |

RLS policies zorgen ervoor dat elke rol alleen hun eigen data kan lezen/schrijven.

---

## 6. Frontend Structuur

Drie dashboards met gedeelde componenten:

### Productie Dashboard
- Snij-batch registreren (kwaliteit + kleur + maat + aantal)
- Afwerk-batch registreren (selecteer uit gesneden voorraad + afwerkingsvorm)
- Bundel samenstellen (selecteer configuratie, systeem trekt af van finished_stock)
- Locatiebeheer (waar ligt wat)

### Verkoop Dashboard
- Bundel-beschikbaarheid per configuratie/klant
- Pipeline-doorkijk: "50 bundels nodig → 20 klaar, 15 maakbaar, 10 te snijden"
- Levertijd-inschatting op basis van productietijden
- Klantprijzen raadplegen

### Management Dashboard (fase 1+2: alleen read-only overzicht)
- Totaaloverzicht voorraad per niveau
- KPI's (productie-snelheid, voorraadniveaus, trends)
- _Klant/prijsbeheer en bundel-configuraties: frontend in latere fase, schema nu al aanwezig_

### Gedeelde modules
- Product-configurator (collectie → kwaliteit → kleur → afwerking selectie)
- Pipeline-view component (visueel overzicht van de drie niveaus)
- Bundel-samensteller (drag & drop of selectie-interface)

---

## 7. Realtime Updates

Supabase Realtime subscriptions op:
- `raw_stock` — productie ziet direct als er gesneden is
- `finished_stock` — productie en verkoop zien afgewerkte voorraad live
- `bundle_stock` — verkoop ziet direct als bundels klaar zijn

Dit betekent: als productie een batch registreert, ziet verkoop de update zonder te refreshen.

---

## 8. Real-world datastructuur — Artikelnummers & Bundels

### 8.1 Artikelnummer opbouw

Een artikelnummer zoals `AEST13XX030050` is als volgt opgebouwd:

```
AEST  13  XX  030  050
│     │   │   │    └── Hoogte in cm (50)
│     │   │   └─────── Breedte in cm (30)
│     │   └─────────── Scheidingsteken
│     └─────────────── Kleurcode
└───────────────────── Kwaliteitsafkorting (type)
```

De kwaliteitsafkorting komt overeen met een `quality` in het datamodel. Bekende kwaliteiten:

**30×50 cm kwaliteiten:** AEST, ESSE, VERR, CEND, OASI, CAVA, CRAF, BRUS, AMOR, SUED, VELV, PROS

**40×40 cm kwaliteiten:** BABY, KASS, ECLA, LIGN, MODR, OLIM, OMBR, PABL, PLUS, RACC, CURY, ZENN, GALA

### 8.2 Bekende bundels

Stalen worden **fysiek aan elkaar gemaakt per kwaliteitsgroep** binnen een bundel. Drie bekende bundel-configuraties voor klant 500008 (Headlam Stalen):

#### Bundel A — Order 26513470 (30×50, 46 stalen)

| Kwaliteit | Kleuren |
|-----------|---------|
| AEST | 13, 14, 15, 17, 22, 42, 56, 62 |
| ESSE | 13, 14, 15, 17, 22, 42, 56, 62 |
| VERR | 12, 17, 68 |
| CEND | 65 |
| OASI | 11, 13, 15, 51, 53, 67 |
| CAVA | 12, 15, 62 |
| CRAF | 15, 18 |
| BRUS | 13, 32, 48, 69 |
| AMOR | 13, 17 |
| SUED | 11, 13, 17, 62 |
| VELV | 10, 13, 16, 48, 68 |

#### Bundel B — Order 26513460 (30×50, 73 stalen)

| Kwaliteit | Kleuren |
|-----------|---------|
| AEST | 13, 14, 15, 17, 22, 42, 56, 62 |
| ESSE | 13, 14, 15, 17, 22, 42, 56, 62 |
| VERR | 12, 13, 14, 15, 17, 18, 53, 68 |
| CEND | 21, 58, 65, 69 |
| PROS | 21, 23, 24, 25, 31, 37, 42, 54, 63, 64, 65, 69 |
| OASI | 11, 13, 15, 51, 53, 67 |
| CAVA | 12, 15, 62 |
| CRAF | 15, 18 |
| BRUS | 13, 32, 48, 69 |
| AMOR | 13, 17 |
| SUED | 11, 13, 17, 62 |
| VELV | 10, 11, 13, 15, 16, 21, 23, 24, 48, 68 |

#### Bundel C — Order 26513480 (40×40, 59 stalen)

| Kwaliteit | Kleuren |
|-----------|---------|
| BABY | 12, 23, 53 |
| KASS | 21, 31, 41, 52, 62 |
| ECLA | 12, 13, 52, 54 |
| LIGN | 13, 22, 24, 52 |
| MODR | 17, 22, 37, 69 |
| OLIM | 13, 24, 45, 53, 63, 69 |
| OMBR | 12, 14 |
| PABL | 10, 14, 16, 20, 22, 23, 24, 33, 36, 44, 45, 56, 59, 65, 92 |
| PLUS | 11, 12, 13, 21, 23, 25, 43, 55, 69 |
| RACC | 13, 15, 23 |
| CURY | 12 |
| ZENN | 11, 13 |

#### GALA individueel (40×40, 1 staal per klant)

| Klant | Kleur |
|-------|-------|
| 500009 | 10 |
| 500010 | 12 |
| 500011 | 13 |
| 500012 | 14 |
| 500013 | 15 |
| 500014 | 42 |
| 500015 | 53 |

### 8.3 Mapping naar datamodel

| Veld in export | Datamodel |
|----------------|-----------|
| Debiteur (500008) | `clients.id` of extern klantnummer |
| Naam (HEADLAM STALEN) | `clients.name` |
| Order (26513470) | Toekomstig ordermanagement (fase 3) |
| Kwaliteitsafkorting (AEST) | `qualities.code` |
| Kleurcode (13) | `color_codes.code` |
| Afmeting (030050) | `sample_dimensions` (30×50 cm) |
| Afmeting (040040) | `sample_dimensions` (40×40 cm) |

---

## 9. Niet in scope (fase 1+2)

- Ordermanagement & statusflow
- Automatische orderimport (mail/API)
- Productie-planning & capaciteit
- Sticker-generatie (data is wel aanwezig)
- Facturatie-export
- Automatische meldingen/drempels (views zijn voorbereid)
- Self-service klantportaal
- Meerdere magazijnen (warehouse_id is voorbereid)
