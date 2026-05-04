# Voorraadbeeld-seam: één read-model voor voorraad, fulfillability en tekorten

Bron: https://github.com/Miguel-AIProgression/karpiBVstalen/issues/2 (#2)

## Problem Statement

Op vier plekken in de app stelt code variaties van dezelfde vraag — *"wat is er op voorraad, wat is besteld, wie krijgt wat?"* — maar elk doet dat in eigen ad-hoc vorm:

- **Orders-lijst** ([orders/page.tsx](src/app/(app)/orders/page.tsx)) bouwt zelf een `Map<stockKey, finished>` om per order een leverbaarheidsstatus te tonen.
- **Order-detail** ([orders/[id]/page.tsx](src/app/(app)/orders/[id]/page.tsx)) doet dezelfde aggregatie opnieuw, maar dan per regel.
- **Productie-tekorten** ([productie/page.tsx](src/app/(app)/productie/page.tsx)) gebruikt al wél een seam ([lib/productie/planning.ts](src/lib/productie/planning.ts), met tests), maar daar bouwt elke caller zélf de Maps die `buildShortages` als input verwacht.
- **Stalen-overzicht** ([stalen/page.tsx](src/app/(app)/stalen/page.tsx)) berekent backorder per staal en doet daarbij óók nog legacy bundle-expansie.

Daarnaast doen `excel-import-modal`, `sample-form-modal`, `pipeline-view`, `quick-entry-modal` en `finishing-modal` ook nog ad-hoc lookups op `finished_stock` en de samengestelde `(quality_id, color_code_id, dimension_id)`-key.

**Vanuit gebruikersperspectief:**

- *Verkoop* kijkt naar de orderlijst en ziet "voldoende voorraad", boekt vervolgens een tweede order voor hetzelfde staal — die ook "voldoende" toont — terwijl ze in werkelijkheid om dezelfde 5 stuks vechten.
- *Productie* ziet op de tekortenpagina iets totaal anders dan wat de orderlijst suggereert: dezelfde staal is daar wél als tekort gemarkeerd. Onmogelijk uit te leggen.
- *Ontwikkelaars* moeten bij elke wijziging in voorraad-of-besteldogica vier plekken raken; bugs (bv. dubbeltelling, verkeerde key) reproduceren zich op één plek maar leven door op alle andere.

## Solution

Eén **Voorraadbeeld**-leesmodel achter een seam dat de huidige werkelijkheid in een snapshot vangt en drie consumenten van consistent rekenmateriaal voorziet:

- **`buildShortagesFromVoorraadbeeld(vb)`** voor de productie-tekortenpagina (vervangt de losse Maps-input van `buildShortages`; bestaande functie blijft als entry voor backwards-compat).
- **`buildFulfillability(vb)`** voor de orderlijst en order-detail — geeft per order een binaire status `compleet | onvolledig`, met per regel `needed`/`assigned`. **FIFO op `delivery_date` ASC** zodat overlappende orders elkaar niet ten onrechte allebei groen kleuren; tie-breaker `order_number` ASC.
- **`buildSampleState(vb)`** voor stalen-overzicht en alle modals die "hoeveel beschikbaar / hoeveel openstaande backorder per staal" nodig hebben.

**Voorraadbeeld** is een nieuwe domeinterm, geïntroduceerd in `docs/architecture/decisions.md`, voor "de berekende toestand van alle samples op leesmoment" (afgewerkte voorraad + open orderbehoefte + sample-meta).

## User Stories

1. Als verkoper wil ik dat de orderlijst per order eerlijk laat zien of de voorraad de bestelling kan dekken, rekening houdend met andere openstaande orders die dezelfde stalen reserveren, zodat ik geen toezeggingen doe die fysiek niet uitvoerbaar zijn.
2. Als verkoper wil ik op de orderdetailpagina per regel zien hoeveel er beschikbaar is en hoeveel er aan mij is toegewezen, zodat ik weet of ik moet wachten op productie of meteen kan inplannen.
3. Als productiemedewerker wil ik dat het tekortenoverzicht consistent is met wat verkoop op de orderlijst ziet, zodat ik niet productiecapaciteit verspil aan stalen die volgens de orderlijst al voldoende zijn.
4. Als productiemedewerker wil ik dat bestaande plannings- en weekoverzicht-functionaliteit (`buildShortages`, `planWeeks`, `computePlan`) ongewijzigd werkt, zodat de huidige tekortenpagina geen regressies krijgt.
5. Als productiemedewerker wil ik dat orders zonder leverdatum nog steeds tekorten genereren (zonder deadline), conform het bestaande `pseudo-week 9999`-gedrag.
6. Als verkoper wil ik dat oudere orders (eerdere `delivery_date`) eerst voorraad krijgen toegewezen, zodat klanten met dichterbij liggende deadlines niet plotseling rood worden door een net-geboekte concurrentie.
7. Als verkoper wil ik dat orders met dezelfde leverdatum een deterministische volgorde krijgen (oplopend `order_number`), zodat dezelfde voorraadtoestand altijd hetzelfde verdict geeft.
8. Als ontwikkelaar wil ik dat het Voorraadbeeld in twee lagen staat — een dunne read-laag die uit Supabase fetcht en een set pure compute-functies — zodat de business-rules in vitest-tests verifieerbaar zijn zonder DB.
9. Als ontwikkelaar wil ik dat alle 11 bestaande tests in `planning.test.ts` blijven slagen, zodat ik weet dat de migratie geen verborgen regressies toevoegt.
10. Als ontwikkelaar wil ik nieuwe tests voor `buildFulfillability` (FIFO-correctheid, tie-breakers, lege voorraad, legacy-line-count) en voor `buildSampleState` (reserved + available + minimum-flag), zodat de nieuwe rekenregels expliciet vastliggen.
11. Als ontwikkelaar wil ik dat consumenten kunnen kiezen tussen indexering op samengestelde `StockKey` of op `sample_id` (`samplesById`), zodat zowel sample-driven code (orders, fulfillment) als legacy quality+color+dim-code (planning) op hetzelfde Voorraadbeeld kunnen leunen.
12. Als verkoper of admin wil ik dat orders met `bundle_id`-only regels (legacy zonder `sample_id`) niet stilletjes in fulfillability worden meegenomen, maar via een `legacyLineCount` zichtbaar worden, zodat de UI desgewenst een banner kan tonen — analoog aan het bestaande `getOrderFulfillment`-gedrag.
13. Als beheerder wil ik dat de huidige `bundle_stock`-tabel buiten het Voorraadbeeld valt, zodat we tegen het toekomstige sample-driven model bouwen en de drop-migratie een no-op is voor deze seam.
14. Als ontwikkelaar wil ik dat de bestaande client-side fetch-patronen blijven (Supabase client in `useEffect` per page; geen realtime subscription), zodat we de scope van de wijziging beperkt houden tot architectuur, niet tot een data-loading-rewrite.
15. Als ontwikkelaar wil ik de Voorraadbeeld-introductie in losse stappen kunnen mergen — types + snapshot eerst, dan fulfillability, dan sample-state, dan productie-migratie — zodat elke stap onafhankelijk reviewbaar is.
16. Als ontwikkelaar wil ik dat de nieuwe term *Voorraadbeeld* in `docs/architecture/decisions.md` is gedocumenteerd met de zes ontwerpkeuzes en hun motivatie, zodat toekomstige reviewers de seam-shape niet hoeven te re-litigeren.

## Implementation Decisions

**Module-keuze (uit grilling-loop):**

- **Q1 = B** — `StockKey` (samengestelde `qualityId|colorCodeId|dimensionId`) blijft de interne sleutel; het Voorraadbeeld exposeert daarnaast `samplesById: Map<sample_id, SampleInfo>` voor sample-driven callers. Geen schema-wijziging op `finished_stock`.
- **Q2 = B** — Pure compute-laag bovenop dunne read-laag, in lijn met de stijl van `planning.ts`. Drie compute-functies (`buildShortages…`, `buildFulfillability`, `buildSampleState`) lezen één gedeeld Voorraadbeeld-DTO.
- **Q3 = "Voorraadbeeld"** — Nederlandse domeinterm, vastgelegd in `decisions.md`.
- **Q4 = B** — FIFO-toewijzing op leesmoment, gesorteerd op `delivery_date` ASC. Tie-breaker: `order_number` ASC. Orders zonder `delivery_date` gaan achteraan, conform bestaand pseudo-week-9999-patroon.
- **Q5 = C** — Voorraadbeeld kijkt uitsluitend naar `finished_stock`. `bundle_stock` valt expliciet buiten beeld; bij de toekomstige drop-migratie verandert er niks aan deze seam.
- **Q6 = A** — Legacy `bundle_id`-only `order_lines` worden geskipt in fulfillability-toewijzing maar wel geteld als `legacyLineCount` per order, analoog aan `getOrderFulfillment`. Bundle-uitpakking op deze plek niet herintroduceren.
- **Q7 = A** — Order-fulfillability is binair: `compleet | onvolledig`. Eén regel zonder volledige toewijzing → hele order onvolledig.

**Modules die gebouwd of gewijzigd worden:**

- **Nieuw**: `Voorraadbeeld`-module met submodules `types`, `snapshot` (read-laag tegen Supabase), `fulfillability` (compute), `sample-state` (compute).
- **Gewijzigd**: bestaande `planning`-module krijgt een tweede entry-point dat een Voorraadbeeld accepteert in plaats van losse Maps; bestaande `buildShortages(maps, opts)` blijft werken.
- **Pages die migreren naar Voorraadbeeld** (in deze volgorde): `orders/page.tsx`, `orders/[id]/page.tsx`, `stalen/page.tsx`, `productie/page.tsx`. Modals (`excel-import`, `sample-form`, `quick-entry`, `finishing`) volgen indien ze stock-aggregatie doen.
- **Niet gewijzigd**: `lib/pricing.ts`, `lib/order-fulfillment.ts`, `lib/articles.ts`, `client_quality_names`-lookups (apart spoor — zie kandidaat 3 uit de architectuurverdieping).

**Sample-info verrijking:**

- `SampleInfo` krijgt expliciet `id` (sample_id) en `articleNumber` zodat sample-driven callers niet via de samengestelde key terug-resolven.

**Order-demand-shape:**

- `OrderDemand` krijgt expliciet `orderId`, `orderNumber`, `status`, `deliveryDate` en een lijst regels met `sampleId` + `stockKey` + `quantity`. Plus `legacyLineCount` voor banner-doeleinden.
- Open orders worden vóór toelevering aan compute-functies gesorteerd op `(delivery_date ASC, order_number ASC)`. Wat "open" betekent (welke statussen wel/niet meetellen) wordt centraal in de read-laag bepaald — niet door elke caller opnieuw.

**Architectuurbesluit voor `decisions.md`:**

- Nieuwe entry: *"Voorraadbeeld als seam (mei 2026)"* met de zes Q-keuzes en hun rationale, in dezelfde stijl als de bestaande "Order fulfillment als seam"- en "Pricing seam-test"-entries.

## Testing Decisions

**Wat een goede test is hier:**

- Test alleen extern gedrag (input-DTO → output), niet implementatiedetails (interne Maps, sorteer-volgorde van interne arrays die buiten de output blijven).
- Compute-functies zijn pure functies van input-DTO's — geen Supabase, geen netwerk, geen `new Date()` (datum wordt geïnjecteerd, conform bestaand `today: Date`-patroon in `planning.ts`).
- Read-laag (`snapshot.ts`) is een dunne Supabase-wrapper en wordt niet uitputtend unit-getest; integratiecorrectheid leunt op de compute-tests die het output-DTO consumeren.

**Modules met nieuwe tests:**

- `fulfillability` — minimaal: FIFO-correctheid (twee orders bijten elkaar; oudere wint volledig), tie-breaker op `order_number`, geen-voorraad-geval, lege orderlijst, order met `legacyLineCount > 0` blijft `legacyLineCount` exposeren, binaire status correct (één onvolledige regel → hele order onvolledig).
- `sample-state` — minimaal: `reserved + available = finished` invariant, `belowMinimum`-flag, samples zonder open orders, samples met meerdere overlappende orders.

**Modules met overlevende tests:**

- Alle 11 tests in `planning.test.ts` blijven slagen omdat de bestaande `buildShortages(maps, opts)`-API ongewijzigd blijft. Een nieuwe `buildShortagesFromVoorraadbeeld(vb, opts)` is een dunne wrapper die intern de huidige functie aanroept met uit `vb` afgeleide Maps; één extra equivalence-test is voldoende om die wrapper te dekken.

**Prior art:**

- [src/lib/productie/planning.test.ts](src/lib/productie/planning.test.ts) is het ijkpunt: pure-function tests met geïnjecteerde `today`, gebruik van helpers (`samplesMap`, `stockMap`, `sample`) om DTO's compact op te bouwen, conservation-invariants als laatste check. Nieuwe tests volgen dezelfde stijl.

## Out of Scope

- **Schema-wijzigingen aan `finished_stock`** (bv. een `sample_id`-FK toevoegen) — Q1 = B koos expliciet voor StockKey-blijft-intern. Een latere migratie kan dit alsnog opruimen, maar zit niet in deze PRD.
- **`bundle_stock` integreren in voorraad-totaal** — Q5 = C. Deze tabel blijft buiten het Voorraadbeeld. Drop hangt aan de bredere drop-migratie van legacy bundles/collecties.
- **Legacy `bundle_id`-only `order_lines` uitpakken** — Q6 = A. Geskipt + geteld; geen bundle-expansie in deze seam. Bundle-expansie in [stalen/page.tsx](src/app/(app)/stalen/page.tsx) is een aparte deepening-kandidaat (kandidaat 5 uit de architectuurverdieping) die hangt aan de drop-migratie.
- **DB-reservering** (een `reserved_qty`-kolom of `reservations`-tabel) — niet nodig zolang FIFO-toewijzing op leesmoment volstaat.
- **Realtime subscriptions** op stock-mutaties — bestaande pages blijven `useEffect`-fetchen.
- **Server-component-migratie** (RSC) — bestaande client-side patroon blijft, om de scope van de wijziging beperkt te houden.
- **Granulaire fulfillability-statussen** (`compleet | deels | niet`) — Q7 = A koos binair. Toekomstige UI-wens kan dit alsnog vragen; uitbreiding is dan additief.
- **Pricing-seam adoptie in order-create-modal** — separaat traject, geen depth-toevoeging maar adoptie.
- **Klant-context-module** voor `client_quality_names`-lookup duplicatie — separate kandidaat (kandidaat 3 uit de architectuurverdieping).
- **`location`-resolution duplicatie** in `quick-entry-modal` + `finishing-modal` — separate kandidaat (4).

## Further Notes

**Volgorde van implementatie (elk afzonderlijk reviewbaar):**

1. **Stap 1 — fundering**: `Voorraadbeeld`-types + `snapshot`-read-laag + `buildShortagesFromVoorraadbeeld`-wrapper. Nieuwe equivalence-test verifieert dat wrapper en bestaande `buildShortages` dezelfde output geven op gelijke input.
2. **Stap 2 — fulfillability**: `buildFulfillability` + tests + adoptie in `orders/page.tsx` en `orders/[id]/page.tsx`. Vanaf hier zien beide pages eerlijke FIFO-status.
3. **Stap 3 — sample-state**: `buildSampleState` + tests + adoptie in `stalen/page.tsx` (legacy bundle-expansie blijft staan, valt onder een aparte refactor).
4. **Stap 4 — productie migreren**: `productie/page.tsx` schakelt over naar `…FromVoorraadbeeld`-entry; oude entry blijft beschikbaar voor backwards-compat.
5. **`decisions.md`-entry** kan in stap 1 mee, of als losse PR vooraf.

**Niet-functionele kanttekening:**

- Eén Supabase-roundtrip per `readVoorraadbeeld()`-aanroep ontvangt drie tabellen (`samples`, `finished_stock`, open `orders` + `order_lines`). Lijst-pages riepen dit deels al — geen netto extra werk, eerder consolidatie.

**Relatie tot bestaande ADR's:**

- Sluit aan bij **"Order fulfillment als seam (2026-05-03)"** — daar werd gemotiveerd dat dezelfde domeinvraag op één plek hoort. Voorraadbeeld doet hetzelfde voor de leesvraag rond samples + finished_stock + open orderbehoefte.
- Sluit aan bij **"Pricing seam-test (2026-05-03)"** — zelfde deletion-test-redenering: vier callers, één seam, een interne sleutel die niet meer naar callers lekt.
- Niet in conflict met **"`samples.location` als enige locatiebron (2026-03-30)"** — locatie zit niet in het Voorraadbeeld.

