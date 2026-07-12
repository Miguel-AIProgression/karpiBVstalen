# Karpi Staaltjesbeheer — CLAUDE.md

## Wat is dit project?
Intern voorraadbeheersysteem voor Karpi BV (tapijt-staaltjes). Voorraad = afgewerkte stalen.
Drie gebruikersrollen: productie, verkoop, admin. Max ~10 gebruikers.

## Tech Stack
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Frontend:** Next.js 15.3.8 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui v4 (base-nova)
- **Hosting:** Vercel
- **Taal UI:** Nederlands

## Projectstructuur
```
karpi-sample-management/
├── supabase/migrations/          # SQL migrations
├── src/app/
│   ├── login/                    # Auth login
│   ├── auth/callback/            # OAuth callback
│   └── (app)/                    # Route group (AuthProvider + sidebar)
│       ├── orders/               # Orders overzicht + detail
│       ├── stalen/               # Stalen + Voorraad + snelle invoer
│       ├── prijslijst/           # Prijslijsten lijst + detail (ERP-stijl)
│       ├── productie/            # Tekorten-overzicht (berekend)
│       └── klanten/              # Klantbeheer + prijslijst-koppeling
├── src/components/               # Gedeelde componenten
├── src/lib/
│   ├── articles.ts               # formatArticleNumber + DEFAULT_PRICE_LIST_NR
│   ├── pricing.ts                # getPriceForArticle / getPricesForArticles
│   └── supabase/                 # Supabase clients + types
└── docs/                         # Architectuurdocs
```

## Architectuur Referenties
- Database schema: `docs/architecture/database.md`
- Frontend structuur: `docs/architecture/frontend.md`
- Beslissingen: `docs/architecture/decisions.md`
- Vereenvoudigde 5-pagina spec: `docs/superpowers/specs/2026-03-25-simplified-5-page-app-design.md`
- Implementatieplan: `docs/superpowers/plans/2026-03-25-simplified-5-page-app.md`

## Kernregels
1. **`samples` tabel** materialiseert stalen (quality + color + dimension + foto + min_stock + **location** + `article_number`). Elk staal IS het artikel.
2. **`samples.article_number`** (UNIQUE, `{quality_code}-{color_code}-{dim_short}`) — gebruikt voor display, niet voor prijzen.
3. **`samples.location`** is de enige locatiebron (format `X-00-00`). Hoeveelheden in `finished_stock`.
4. **Prijzen via `price_lists` + `price_list_lines (price_list_nr, quality_id, carpet_dimension_id, price_cents)`** — ERP-stijl per **kwaliteit + carpet-afmeting**, niet per staal. Stickers tonen alle carpet-prijzen voor de kwaliteit van het staal. Klanten gekoppeld via `clients.price_list_nr`. `src/lib/pricing.ts` is de enige seam.
5. **Order-flow is artikel-driven**: `order_lines.sample_id` → één regel per staal. Geen prijs op order-niveau (carpets ≠ samples). Bundles/collecties/accessoires zijn weg; legacy tabellen droppen via `99999999_drop_legacy_bundles_pricing.sql` ná productie-verificatie.
6. **Rollen** via `app_metadata.role` in Supabase JWT (`production`, `sales`, `admin`)
7. **Nederlandse UI-teksten** in alle labels, buttons, placeholders
8. **shadcn v4 base-nova** gebruikt `@base-ui/react` — niet Radix
9. **`locations` tabel** wordt niet meer actief gelezen door de UI — alleen als FK voor `finished_stock`
10. **Facturen & creditnota's**: creditnota = `invoices`-rij met `credited_invoice_id` + negatieve bedragen, zelfde STL-reeks; regels snapshot-first uit `invoice_lines`; "dé factuur van een order" = filter `credited_invoice_id IS NULL`. Crediteren alleen via RPC `create_credit_invoice` achter `requireRole(['sales','admin'])`. Verwijderen: alléén niet-gemailde facturen, via `DELETE /api/invoices/[id]` (zelfde rol-gate); een gemailde factuur is onverwijderbaar (BEFORE DELETE-trigger `invoices_no_delete_when_sent`, ook voor service-role) — crediteer in plaats daarvan. Menu-item **Facturatie** (`/facturatie`) is het facturen-werkblad (debet + credit, filters, AFAS-CSV-export). Details: `docs/architecture/database.md` §Facturatie.

## Supabase toegang
- Supabase project op **klant-account** (project `mbqvhpdwtgtfbnscqrul`)
- Credentials in `.env.local`
- Gebruik **Supabase REST API** of **SQL via `curl`**, NIET de MCP Supabase tools

## Commando's
```bash
npm run dev          # Start dev server
npm run build        # Production build
npx supabase db push # Push migrations naar Supabase
```

## Huidige status
- [x] Vereenvoudigde 5-pagina app (maart 2026)
- [x] Sticker-systeem voor klant-specifieke labels
- [x] Locatie-vereenvoudiging: `samples.location` als enige bron (maart 2026)
- [x] **Prijslijsten + artikel-driven orders (mei 2026)** — ERP-stijl prijslijsten, sample = artikel, order-flow herschreven
- [x] **Prijslijsten v2 (mei 2026)** — `price_list_lines` per `(quality_id, carpet_dimension_id)`. Stickers tonen carpet-prijzen per kwaliteit; prijslijsten 0150 + 0151 toegevoegd uit klantenbestand-Excels.
- [x] **Prijslijsten 0210-0217 (mei 2026)** — 8 echte Benelux-prijslijsten geïmporteerd uit Excel-bestanden van Sales Support per 01.04.2026 (~2228 regels). Klanten op 0150 → 0210, 0151 → 0211. 0150/0151 op `active=false`. 13 ontbrekende qualities (CLSS/FEAT/GRAE/NATR/OFFG/PEBF/PEBS/SHDE/SISS/SOPI/SOPV/VIBE/WOTO) in 0214-0217 zijn skipped via INNER JOIN — toevoegen aan `qualities` + re-emit nodig.
- [x] **Prijslijst 0107 HEADLAM (juni 2026)** — klant-/adviesprijslijst geïmporteerd (331 regels: 306 stuks + 25 m²) via `scripts/import-prijslijst-0107.mjs`. Kolommen B/D i.p.v. C/E; separator-regex verruimd naar `[A-Z][A-Z0-9]` voor P1/P2/P3-printvarianten (SEAO had hierin zijn enige stuks-prijzen). Afmeting `200x300` toegevoegd. Geen klant-koppeling. 10 BEAC-kleurconflicten → meerderheidsprijs op kwaliteitsniveau, met **volledige kleur-override voor BEAC kleur 99** (duurder) in `price_list_color_lines` via `scripts/beac99-exception-0107.mjs`.
- [x] **Prijslijst 0601 In House (juni 2026)** — collectielijst per 01.06.2026 geïmporteerd (186 regels: 159 stuks + 27 m²) via `scripts/import-collectie-inhouse-2026.mjs --apply`. **Bijzonder: `price_cents` = de DIRECTE verkoopprijs** (geen kostprijs × factor zoals andere lijsten). Order-modal kreeg een **×1-knop** → kies ×1 zodat de sticker de prijs 1-op-1 toont (m²-prijzen op …0 worden door 5/9-afronding €1 lager getoond — bewust simpel gehouden). Kwaliteitsnamen gematcht op naam/code + aliassen (Prosper→PROS, Raccoon→RACC, Suedes Shades→SUED, Loop→LOOP); 3 mix/sheet-conflicten → laagste prijs.
- [ ] Migratie `20260329_location_simplification.sql` nog uitvoeren in Supabase
- [ ] Migraties `20260503_price_lists.sql` + `20260503_order_lines_sample_id.sql` + **`20260503_price_lists_v2.sql`** uitvoeren in Supabase
- [ ] **Migratie `20260504_price_list_colors_and_samples.sql`** uitvoeren in Supabase — voegt `price_list_colors` (kleur-whitelist per prijslijst×kwaliteit) en `price_list_sample_prices` (staaltjes-prijs per prijslijst×kwaliteit) toe.
- [ ] Na productie-verificatie: `99999999_drop_legacy_bundles_pricing.sql` om bundels/collecties/oude prijzen te droppen
- [ ] **Voorraadbeeld-seam** ([issue #2](https://github.com/Miguel-AIProgression/karpiBVstalen/issues/2)) — één read-model voor voorraad + fulfillability + tekorten; consolideert `stockKey`/finished_stock-aggregatie uit 9+ callers. Vier stappen, FIFO op `delivery_date`, sample-only (geen `bundle_stock`).
- [ ] Sticker printer API-integratie (toekomst)

## Zelflerende instructie
> Bij elke grote wijziging:
> 1. Update dit bestand als de wijziging de kernstructuur raakt
> 2. Update het relevante bestand in `docs/architecture/` voor details
> 3. Voeg geleerde lessen toe aan `docs/architecture/decisions.md`
> Dit bestand mag MAXIMAAL 100 regels zijn. Verwijs naar subdocs voor details.
