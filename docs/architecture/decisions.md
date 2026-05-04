# Architectuurbeslissingen & Inzichten

## Beslissingen
- **Variant = combinatie**: Staaltje-varianten worden niet apart opgeslagen, maar berekend uit regels
- **Triggers voor voorraad**: Database triggers houden stock-tabellen consistent (niet applicatielogica)
- **Rollen via app_metadata**: Geen aparte user_roles tabel, role zit in Supabase JWT
- **`samples.location` als enige locatiebron** (2026-03-30): 3 locatiesystemen (samples.location, *_stock.location_id, locations tabel) teruggebracht naar 1. `samples.location` (tekstveld `X-00-00`) is de enige bron. `finished_stock` houdt hoeveelheden bij maar `location_id` wordt niet meer gelezen door UI. Reden: systemen raakten uit sync, overkill voor ~10 gebruikers met 1 magazijn.
- **Pipeline vereenvoudigd** (2026-03-30): "Gesneden → Afgewerkt → Bundels" pipeline teruggebracht naar alleen "Afgewerkt + Bundels". `raw_stock` wordt niet meer gelezen. Quick-entry schrijft direct naar `finished_stock` i.p.v. `finishing_batches`.
- **Prijslijsten ERP-stijl + artikel = staal** (2026-05-03): bundle/collectie/accessoire-flow vervangen door artikel-driven orders. Elk staal heeft een `article_number` (UNIQUE). Klanten gekoppeld aan één `price_list_nr`; prijs-lookup via `src/lib/pricing.ts` als enige seam. Order-create-modal: 6 → 4 stappen. `client_carpet_prices` / `quality_base_prices` / `client_purchase_prices` / `order.price_factor` worden vervangen door `price_lists` + `price_list_lines`. Bundles/collections/accessoires/extras tabellen droppen ná productie-verificatie. Reden: alignment met ander Karpi ERP project, één pricing-seam, één order-intake-module ipv vier verspreide bronnen.
- **Order fulfillment als seam** (2026-05-03): sticker-print, pakbon en order-detail vroegen alledrie hetzelfde — _"wat zit er in deze order, uitgepakt naar staal-niveau, met klant-context?"_ — en herhaalden 80-100 regels expand-logica (bundle_colors of bundle_items, sample-id lookup, klant-eigen kwaliteitsnamen, prijzen). Geconsolideerd in `src/lib/order-fulfillment.ts` met één functie `getOrderFulfillment(supabase, orderId): Fulfillment | null`. Achter de seam: order + klant + lines op staal-niveau (custom names + prijzen + locaties). Strict sample-driven: legacy bundle-only regels worden overgeslagen (banner toont in UI). Voorraad zit bewust NIET in fulfillment — runtime-state, niet eigendom van de order. **Domeinterm**: "Fulfillment" = de uitwerking van een order tot wat er fysiek klaargezet/verstuurd wordt.
- **Voorraadbeeld als seam** (2026-05-03, [issue #2](https://github.com/Miguel-AIProgression/karpiBVstalen/issues/2)): orders-lijst, order-detail, productie-tekorten en stalen-overzicht stelden allevier variaties van dezelfde leesvraag — _"wat is op voorraad, wat is besteld, wie krijgt wat?"_ — en herhaalden elk de `(quality_id|color_code_id|dimension_id)`-sleutel + finished_stock-aggregatie ad hoc. Risico: orders-lijst zegt "voldoende" terwijl productie hetzelfde staal als tekort meldt. Gevangen in één snapshot-leesmodel `Voorraadbeeld` met dunne read-laag (`readVoorraadbeeld(supabase)`) + drie pure compute-views: `buildShortagesFromVoorraadbeeld` (productie), `buildFulfillability` (orders), `buildSampleState` (stalen). De pure-compute-stijl van `lib/productie/planning.ts` blijft het ijkpunt; de huidige `buildShortages(maps, opts)`-API blijft werken zodat alle 11 vitest-tests overleven. **Zes ontwerp-keuzes** (uit grilling-loop):
  1. `StockKey` (`qualityId|colorCodeId|dimensionId`) blijft interne sleutel — het Voorraadbeeld exposeert daarnaast `samplesById` voor sample-driven callers. Geen FK-migratie op `finished_stock`.
  2. Pure compute bovenop dunne read-laag, niet één grote samen-module — past bij de bestaande `planning.ts`-stijl en houdt vitest-vriendelijk.
  3. FIFO-toewijzing op leesmoment, gesorteerd op `(delivery_date ASC, order_number ASC)`; orders zonder leverdatum gaan achteraan (conform pseudo-week-9999-conventie). Overlappende orders zien elkaar — zonder DB-reservering.
  4. `bundle_stock` valt buiten beeld (sample-only) — drop-migratie wordt no-op voor deze seam.
  5. Legacy `bundle_id`-only `order_lines` worden geskipt + geteld als `legacyLineCount` per order (analoog aan `getOrderFulfillment`-banner-pattern).
  6. Order-fulfillability is binair: `compleet | onvolledig`. Eén regel rood = order rood.
  
  **Domeinterm**: "Voorraadbeeld" = de berekende toestand van alle samples op leesmoment (afgewerkte voorraad + open orderbehoefte + sample-meta). Bestaande client-side fetch-patronen blijven; geen RSC-migratie, geen realtime in deze seam.

## Geleerde lessen
<!-- Voeg hier inzichten toe die tijdens development opdoen -->
<!-- Voorbeeld: "shadcn v4 gebruikt base-nova style met @base-ui/react, niet Radix" -->
- shadcn v4 (base-nova) gebruikt `@base-ui/react` primitives ipv Radix — componenten werken anders dan shadcn v2 docs
- Next.js 16 scaffoldt met Turbopack standaard
- Locatie-vereenvoudiging: als systemen onafhankelijk dezelfde info bijhouden, kies 1 bron en verwijder de rest. Complexere normalisatie (FK naar locaties-tabel) was overkill voor deze schaal.
- **Pricing seam-test (2026-05-03)**: voorheen lekte prijs-logica uit naar 4 verschillende plekken (sticker-print L135-177, klanten-detail PrijzenTab, prijslijst-editor, order-create-modal price_factor). Deletion-test wees uit dat het pass-through patroon was — verplaatste complexity ipv het in te kapselen. Vervangen door `src/lib/pricing.ts` met `getPriceForArticle / getPricesForArticles`. Alle callers gebruiken die ene seam.
- **Frontend rewrite-vs-refactor (2026-05-03)**: bij grote bestanden (1500+ regels) zoals oude order-create-modal en order-detail-page, vervangen via `Write` is sneller én oplevert minder regressies dan honderden Edits achter elkaar. Indicator: als de helft van het bestand de oude semantiek heeft, herschrijf.

## ADR-004: Prijslijst-import via gegenereerde SQL ipv hardcoded data

**Datum:** 2026-05-03
**Status:** Accepted

**Context:** Bij v2 (0150/0151) hebben we klant-mappings handmatig in SQL gehardcodeerd. Voor de 8 nieuwe lijsten 0210-0217 hebben we ~2228 prijs-regels uit 8 Excel-bestanden te importeren. Hardcoden is onbeheerbaar; bron (Excel) loskoppelen van SQL is wenselijk omdat Sales Support periodiek nieuwe Excels aanlevert.

**Beslissing:** `scripts/import-prijslijsten-210-217.mjs` is de canonieke transformer. Het script genereert `supabase/migrations/20260504_price_list_lines_210_217.sql`. De Excel-bestanden zijn de bron-van-waarheid; de migratie is een afgeleide artefact die we wel committen voor reproduceerbaarheid en audit.

De parser is generiek genoeg om alle gevonden Excel-conventies te dekken:
- 2-letter separators (XX, KK, LO, KN, KB, FE) als gelijkwaardige variant
- KK-encoding `NNN000` voor `NNN ROND`
- KK-encoding `MAATWK` voor MAATWERK
- 6-cijferige reversed dims (w > h) → `<swap> organisch`

Conflict-resolutie: bij meerdere prijzen voor dezelfde `(quality, dim, unit)` kiezen we de **modus** (meest voorkomend), bij gelijke counts de laagste, met logging van alle conflicten.

**Gevolgen:**
- ✅ Re-import bij prijswijziging: vervang Excel + re-run script + nieuwe migratie.
- ✅ De SQL is leesbaar (`INSERT … SELECT` met `JOIN` op `qualities.code`/`carpet_dimensions.name`, geen UUID-noise).
- ✅ Idempotent via `ON CONFLICT DO NOTHING` (zonder target — partial unique index is auto-arbiter).
- ⚠ Twee bronnen in repo (Excel + gegenereerde SQL) moeten gesynced blijven; het script is idempotent (re-run overschrijft de migratie).
- ⚠ Klant-mappings (0150 → 0210 etc.) blijven in een aparte hand-geschreven migratie omdat ze geen Excel-bron hebben.
- ⚠ 13 onbekende quality codes (CLSS/FEAT/GRAE/NATR/OFFG/PEBF/PEBS/SHDE/SISS/SOPI/SOPV/VIBE/WOTO) worden via INNER JOIN stilletjes geskipt. Toevoegen aan `qualities` + re-emit van de migratie maakt ze wel zichtbaar zonder schema-wijzigingen.

**Re-import workflow voor prijswijzigingen:**

`ON CONFLICT DO NOTHING` skipt bestaande regels — een prijswijziging in een nieuwe Excel komt **niet** automatisch door. De juiste workflow voor een refresh is:

1. Plaats de nieuwe Excel-bestanden in repo root (vervang oude).
2. Run `node scripts/import-prijslijsten-210-217.mjs --analyse` om eventueel nieuwe qualities/dims op te sporen.
3. Run `node scripts/import-prijslijsten-210-217.mjs --emit` — dat overschrijft `supabase/migrations/20260504_price_lists_210_217_lines.sql`.
4. Maak een **nieuwe** migratie (nieuwe timestamp) die eerst de oude regels dropt, dan de gegenereerde INSERTs uitvoert:

```sql
-- supabase/migrations/<NIEUWE_TS>_refresh_price_lists_210_217.sql
DELETE FROM price_list_lines WHERE price_list_nr IN ('0210','0211','0212','0213','0214','0215','0216','0217');
-- Plak hier de inhoud van 20260504_price_lists_210_217_lines.sql (zonder de header-comment dubbel)
```

Run die migratie in Supabase SQL Editor. Re-runnen van alleen `20260504_price_lists_210_217_lines.sql` werkt **niet** voor prijs-refreshes — alleen voor nieuwe rijen (zoals na het toevoegen van eerder ontbrekende qualities CLSS/FEAT/…).
