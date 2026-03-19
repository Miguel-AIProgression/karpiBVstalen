# Sales Request Layer — Ontwerp

## Probleem

Bundel-configuraties, klanten en orders zijn te strak verweven. Bundel-configs bevatten ordernummers in hun naam en zijn direct aan klanten gekoppeld zonder tussenliggende laag. Verkoop kan geen verzoeken indienen, voorraad claimen, of tekorten communiceren naar klanten. Productie heeft geen overzicht van wat er gevraagd wordt.

## Oplossing

Een verzoeken- en reserveringslaag tussen verkoop en productie:

1. **Projecten** — klant-specifieke containers (bijv. "Headlam Stalenset Q2 2026")
2. **Verzoeken** — vraag naar X bundels van recept Y, binnen een project
3. **Reserveringen** — koppeling van beschikbare bundle_stock aan verzoeken

Productie blijft op voorraad werken via de bestaande pipeline. Verkoop claimt voorraad via verzoeken.

## Datamodel

### Nieuwe tabellen

#### `projects`

| Kolom | Type | Constraints | Doel |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| client_id | uuid | FK → clients, NOT NULL | Klant waar project bij hoort |
| name | text | NOT NULL | Bijv. "Stalenset Q2 2026" |
| status | text | NOT NULL, CHECK IN ('active','completed','archived'), default 'active' | |
| notes | text | | Vrije notities |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

#### `bundle_requests`

| Kolom | Type | Constraints | Doel |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| project_id | uuid | FK → projects, NOT NULL | |
| bundle_config_id | uuid | FK → bundle_configs, NOT NULL | Welk bundel-recept |
| quantity | integer | NOT NULL, CHECK > 0 | Gevraagd aantal |
| status | text | NOT NULL, CHECK IN ('pending','ready','fulfilled','cancelled'), default 'pending' | |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

#### `bundle_reservations`

| Kolom | Type | Constraints | Doel |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| bundle_request_id | uuid | FK → bundle_requests, NOT NULL | |
| quantity | integer | NOT NULL, CHECK > 0 | Gereserveerd aantal uit voorraad |
| reserved_at | timestamptz | default now() | |

`bundle_config_id` wordt NIET opgeslagen — altijd joinen via `bundle_requests` om data-inconsistentie te voorkomen.

Reserveringen representeren een claim op de **aggregate voorraad** van een bundle_config, niet op specifieke stock-rijen of locaties.

**Over-reservering bescherming:** Een BEFORE INSERT trigger op `bundle_reservations` die:
1. `SELECT ... FOR UPDATE` op de `bundle_request` rij (row-level lock tegen race conditions)
2. Controleert: bestaande SUM(quantity) + nieuwe quantity <= request.quantity
3. RAISE EXCEPTION als de limiet overschreden wordt

### Bestaande wijzigingen

- **`bundle_configs`**: `name` wordt een generiek recept-naam zonder ordernummers.
- **`bundle_configs.is_template`**: kolom verwijderen via migratie. Alle bestaande configs zijn recepten. Eerst verifiëren dat geen frontend-code `is_template` gebruikt, dan `ALTER TABLE bundle_configs DROP COLUMN is_template;`

### Nieuwe view: `v_request_overview`

```sql
SELECT
  br.id AS request_id,
  p.id AS project_id,
  p.name AS project_name,
  c.name AS client_name,
  bc.name AS bundle_name,
  br.quantity AS requested,
  COALESCE(SUM(res.quantity), 0) AS reserved,
  br.quantity - COALESCE(SUM(res.quantity), 0) AS shortage,
  COALESCE(bs_free.free_stock, 0) AS available_stock,
  br.status,
  br.created_at
FROM bundle_requests br
JOIN projects p ON p.id = br.project_id
JOIN clients c ON c.id = p.client_id
JOIN bundle_configs bc ON bc.id = br.bundle_config_id
LEFT JOIN bundle_reservations res ON res.bundle_request_id = br.id
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(bs.quantity), 0) - COALESCE(
    (SELECT SUM(res2.quantity)
     FROM bundle_reservations res2
     JOIN bundle_requests br2 ON br2.id = res2.bundle_request_id
     WHERE br2.bundle_config_id = bc.id), 0
  ) AS free_stock  -- globale vrije voorraad voor deze bundle_config (niet per request)
  FROM bundle_stock bs WHERE bs.bundle_config_id = bc.id
) bs_free ON true
GROUP BY br.id, p.id, p.name, c.name, bc.name, br.quantity, br.status, br.created_at, bs_free.free_stock;
```

### Productie-view: `v_production_demand`

Geaggregeerd per bundel-config EN per klant, zodat productie ziet wie wat nodig heeft:

```sql
SELECT
  bc.id AS bundle_config_id,
  bc.name AS bundle_name,
  c.id AS client_id,
  c.name AS client_name,
  SUM(br.quantity) AS total_requested,
  COALESCE(total_res.total_reserved, 0) AS total_reserved,
  COALESCE(bs.total_stock, 0) AS total_stock,
  COALESCE(bs.total_stock, 0) - COALESCE(total_res.total_reserved, 0) AS free_stock,
  SUM(br.quantity) - COALESCE(total_res.total_reserved, 0) AS total_shortage
FROM bundle_requests br
JOIN projects p ON p.id = br.project_id
JOIN clients c ON c.id = p.client_id
JOIN bundle_configs bc ON bc.id = br.bundle_config_id
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(res.quantity), 0) AS total_reserved
  FROM bundle_reservations res
  JOIN bundle_requests br2 ON br2.id = res.bundle_request_id
  WHERE br2.bundle_config_id = bc.id
) total_res ON true
LEFT JOIN LATERAL (
  SELECT SUM(quantity) AS total_stock FROM bundle_stock WHERE bundle_config_id = bc.id
) bs ON true
WHERE br.status IN ('pending', 'ready')
GROUP BY bc.id, bc.name, c.id, c.name, bs.total_stock, total_res.total_reserved;
```

NB: `free_stock` en `total_reserved` zijn globaal per bundle_config (niet per klant) — dit is correct want voorraad is gedeeld.

### Auto-reservering trigger

Bij INSERT of UPDATE op `bundle_stock` (na bundelen): een trigger die:

1. De nieuwe/verhoogde hoeveelheid bepaalt voor de `bundle_config_id`
2. Alle openstaande verzoeken ophaalt met tekort voor die config, gesorteerd op `created_at ASC` (FIFO)
3. Per verzoek: beschikbaar = MIN(vrije voorraad, tekort voor dit verzoek)
4. INSERT in `bundle_reservations` (de over-reservering trigger beschermt tegen race conditions)
5. Resterende vrije voorraad doorgeven aan het volgende verzoek
6. Stoppen als er geen vrije voorraad meer is

### Status-update trigger

Wanneer SUM(reservations.quantity) voor een request >= request.quantity: status automatisch naar `'ready'`.

### Annulering

Bij status-wijziging naar `'cancelled'`: een trigger die alle bijbehorende `bundle_reservations` verwijdert, waardoor de voorraad weer vrijkomt. De auto-reservering trigger op `bundle_stock` wordt NIET opnieuw getriggerd — de vrijgekomen voorraad wordt beschikbaar voor toekomstige verzoeken.

### Updated_at triggers

BEFORE UPDATE triggers op `projects` en `bundle_requests` die `updated_at = now()` zetten.

### Indexes

- `bundle_reservations(bundle_request_id)` — voor SUM aggregaties in views
- `bundle_requests(bundle_config_id, status)` — voor auto-reservering trigger lookup
- `bundle_requests(project_id)` — voor project-detail pagina

## RLS Policies

- **`projects`**: read voor alle authenticated, insert/update voor `sales` en `admin`
- **`bundle_requests`**: read voor alle authenticated, insert/update voor `sales` en `admin`
- **`bundle_reservations`**: read voor alle authenticated, geen INSERT via RLS voor normale rollen (triggers draaien als definer en bypassen RLS), DELETE alleen voor `admin`

## Frontend

### Verkoop — Nieuwe pagina's

#### `/sales/projects` — Projectenoverzicht

- Lijst van alle projecten, filter op klant en status
- Per project: klantnaam, aantal verzoeken, totaal gevraagd, totaal tekort
- Knop "Nieuw project" → formulier: klant selecteren + naam invoeren

#### `/sales/projects/[id]` — Projectdetail

- Projectinfo: klant, naam, status, notities
- Tabel met verzoeken:
  - Bundel-recept | Gevraagd | Gereserveerd | Tekort | Status
- "Verzoek toevoegen": kies bundel-recept (gefilterd op klant via bundle_configs.client_id) + aantal
- Bij aanmaken: direct tonen hoeveel beschikbaar vs. tekort
- Actieknoppen: markeer als "afgehandeld" of "geannuleerd"
- Status-badge kleuren: pending=geel, ready=groen, fulfilled=grijs, cancelled=rood

#### `/sales/requests` — Alle openstaande verzoeken

- Cross-project overzichtstabel
- Kolommen: klant, project, bundel-recept, gevraagd, gereserveerd, tekort, status
- Filters op klant, status
- Sorteren op aanmaakdatum (oudste eerst)

### Verkoop — Flow

1. Verkoper selecteert klant
2. Maakt project aan (of kiest bestaand project)
3. Kiest bundel-recept(en) + aantallen
4. Systeem toont direct beschikbaarheid
5. Verzoek wordt ingediend → auto-reservering van beschikbare voorraad
6. Verkoper communiceert levertijd naar klant op basis van tekort
7. Bij voldoende voorraad: status → ready
8. Verkoper markeert als afgehandeld na verzending

### Productie — Uitbreiding overzichtspagina

Extra sectie op `/production` (bestaande pagina):

**"Openstaande verzoeken"** tabel:
| Bundel-recept | Klant | Totaal gevraagd | Gereserveerd | Vrije voorraad | Tekort |
|---|---|---|---|---|---|
| Headlam 30x50 | Headlam Stalen | 50 | 20 | 5 | 25 |

- Data uit `v_production_demand` view
- Geen actieknoppen — puur informatief
- Realtime updates via Supabase Realtime

### Realtime subscriptions

Alle nieuwe verkoop- en productie-pagina's subscriben via Supabase Realtime op `postgres_changes` voor:
- `bundle_requests` (INSERT, UPDATE)
- `bundle_reservations` (INSERT, DELETE)
- `bundle_stock` (INSERT, UPDATE) — al bestaand in availability pagina

## Seed data wijzigingen

### Bundle configs hernoemd

- "Headlam 30x50 — Order 26513470" → "Headlam 30x50"
- "Headlam 30x50 — Order 26513460" → "Headlam 30x50 uitgebreid"
- "Headlam 40x40 — Order 26513480" → "Headlam 40x40"
- GALA bundels: naam wordt "GALA — {klantnaam}" (zonder ordernummer)

### Voorbeelddata

- Project: "Stalenset Voorjaar 2026" voor Headlam Stalen
- Verzoeken: 10x Headlam 30x50, 5x Headlam 40x40
- Project per GALA-klant met 1 verzoek elk

## Niet gewijzigd

- Productie-pipeline (snijden, afwerken, bundelen)
- Bundel-samenstelling flow (bundle_config_items)
- Bestaande views (v_pipeline_status, v_bundle_availability, v_restock_needed, v_client_catalog)
- Locatiebeheer
