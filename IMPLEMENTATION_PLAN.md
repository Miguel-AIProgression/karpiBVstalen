# Implementation Plan — Voorraadbeeld-seam

Bron: `specs/voorraadbeeld.md` (= GitHub issue #2). ADR `Voorraadbeeld als seam (2026-05-03)` is al in `docs/architecture/decisions.md:11-19` vastgelegd, dus dat is **geen** task hier.

## Doel
Vier ad-hoc voorraad-aggregaties (`orders/page.tsx`, `orders/[id]/page.tsx`, `productie/page.tsx`, `stalen/page.tsx`) consolideren achter één read-model `Voorraadbeeld` met drie pure compute-views. FIFO-toewijzing op `(delivery_date, order_number)` zodat overlappende orders elkaar zien. Bestaande `buildShortages(maps, opts)`-API + alle 11 vitest-tests in `planning.test.ts` blijven werken.

## Afhankelijkheidsketen
```
T001 (types)
 ├─ T002 (snapshot read-laag)
 │   ├─ T003 (buildShortagesFromVoorraadbeeld + equiv test)  ─┐
 │   ├─ T005 (adopt in orders/page.tsx)                       │
 │   ├─ T006 (adopt in orders/[id]/page.tsx)                  │
 │   ├─ T008 (adopt in stalen/page.tsx)                       │
 │   └─ T009 (adopt in productie/page.tsx) ←─ T003 ────────────┘
 ├─ T004 (buildFulfillability + tests) ─→ T005, T006
 └─ T007 (buildSampleState + tests) ─→ T008
```

---

### T001 ✅ DONE
**Taak:** Voorraadbeeld-types definiëren in nieuwe module `src/lib/voorraadbeeld/types.ts`.

**Discoveries:** `StockKey` + `stockKey`-helper bestonden al in `src/lib/productie/planning.ts` — re-exported i.p.v. dupliceren. `SampleInfo` daarentegen bewust opnieuw gedefinieerd: planning.ts' versie heeft denormalised display-velden (qualityName, hexColor, …) die het Voorraadbeeld niet nodig heeft; nieuwe versie heeft `id` + `articleNumber` voor sample-driven callers.

**Inhoud:**
- `StockKey = string` (bestaand format `qualityId|colorCodeId|dimensionId`) + helper `stockKey(qid, cid, did)`.
- `SampleInfo` — `id` (sample_id), `articleNumber`, `qualityId`, `colorCodeId`, `dimensionId`, `minStock`, `location`.
- `OrderLineDemand` — `sampleId`, `stockKey`, `quantity`.
- `OrderDemand` — `orderId`, `orderNumber`, `status`, `deliveryDate: Date | null`, `lines: OrderLineDemand[]`, `legacyLineCount: number`.
- `Voorraadbeeld` — `today: Date`, `samplesByKey: ReadonlyMap<StockKey, SampleInfo>`, `samplesById: ReadonlyMap<string, SampleInfo>`, `finishedStock: ReadonlyMap<StockKey, number>`, `openOrders: ReadonlyArray<OrderDemand>` (al gesorteerd op `delivery_date ASC, order_number ASC`, null-deliveryDate achteraan).

**Acceptance:**
- Module compileert met `tsc --noEmit`.
- Geen runtime-code (alleen types + `stockKey`-helper).
- `npx eslint src/lib/voorraadbeeld/types.ts` schoon.

**Dependencies:** geen.

---

### T002 ✅ DONE
**Taak:** Read-laag `readVoorraadbeeld(supabase, today)` in `src/lib/voorraadbeeld/snapshot.ts`.

**Discoveries:** "Open orders"-filter is `.neq("status", "completed")` (consistent met productie/page.tsx + stalen/page.tsx). `delivery_date` schema-type zegt `string` maar runtime kan `null` zijn (defensief afgehandeld via `parseDeliveryDate()`-helper). `finished_stock` rijen worden gesommeerd per `(quality_id, color_code_id, dimension_id)` omdat er meerdere kunnen zijn voor dezelfde key (variatie op `finishing_type_id`/`location_id`).

**Inhoud:**
- Drie Supabase-fetches in parallel: `samples` (active), `finished_stock`, open `orders` met genest `order_lines` + `samples(quality_id, color_code_id, dimension_id)`.
- "Open" = elke status anders dan `delivered`/`cancelled` (centraal vastgesteld; controleer bestaand `productie/page.tsx`-filter en hergebruik dezelfde lijst).
- Bouwt `samplesByKey`, `samplesById`, `finishedStock`-Maps.
- `OrderDemand`-array gesorteerd: `delivery_date ASC NULLS LAST, order_number ASC`.
- Per order: lines met `sample_id !== null` → `OrderLineDemand`; lines met alleen `bundle_id` → `legacyLineCount++`.
- Errors bubbelen naar caller (consistent met huidige patroon — geen try/catch).

**Acceptance:**
- `tsc --noEmit` schoon.
- Geen `new Date()` in module — `today` wordt geïnjecteerd, gebruikt voor consumer-injectie maar niet door snapshot zelf.
- Manueel: import in een page levert valide `Voorraadbeeld`-shape die `samplesByKey.size > 0` en `openOrders.length >= 0` produceert (geen runtime-test, type-check volstaat).

**Dependencies:** T001.

---

### T003 ✅ DONE
**Taak:** `buildShortagesFromVoorraadbeeld(vb, opts?)` wrapper in `src/lib/voorraadbeeld/shortages.ts` + equivalence-test.

**Discoveries:** `buildShortages` in planning.ts leest 4 display-velden uit `SampleInfo` (`qualityName`, `colorName`, `hexColor`, `dimensionName`) plus `minStock`/`qualityId`/`colorCodeId`/`dimensionId`. Voorraadbeeld's `SampleInfo` heeft die display-velden bewust níet. **Strategie: wrapper accepteert optionele 2e parameter `planningSamples`** voor display-velden — caller (T009) brengt die data toch al naast het Voorraadbeeld mee. Bij ontbreken van een key valt de wrapper terug op planning.ts' eigen "Onbekend"/empty defaults. 5 tests groen (1 equivalence + 1 leadTimeDays propagation + 3 edge cases). Bestaande planning.test.ts: 13 tests groen (issue spec zei 11 — was outdated).

**Inhoud:**
- Functie roept intern bestaande `buildShortages` aan met uit `vb` afgeleide Maps.
- `opts.leadTimeDays` wordt doorgegeven.
- Nieuwe testfile `src/lib/voorraadbeeld/shortages.test.ts`: bouwt een Voorraadbeeld + equivalente losse Maps; assert dat `buildShortagesFromVoorraadbeeld(vb)` en bestaande `buildShortages(maps, opts)` byte-voor-byte dezelfde `ShortageRow[]` opleveren (sorted by deadline).

**Acceptance:**
- Equivalence-test groen (1 test minimaal; meerdere fixture-scenarios mogen).
- Bestaande 11+ tests in `planning.test.ts` ongewijzigd en groen: `npx vitest run src/lib/productie/planning.test.ts`.
- `npx vitest run src/lib/voorraadbeeld/shortages.test.ts` groen.

**Dependencies:** T001, T002.

---

### T004 ✅ DONE
**Taak:** `buildFulfillability(vb)` pure compute-functie in `src/lib/voorraadbeeld/fulfillability.ts` + tests.

**Discoveries:** Werkkopie via `new Map(vb.finishedStock)` houdt `vb` immutable. `legacyLineCount > 0` ⇒ status `onvolledig` zelfs als alle sample-lines compleet (die afspraak is consistent met "binaire status: één regel rood = order rood" — een legacy bundle-only regel telt als niet-toewijsbaar). 7 tests groen.

**Inhoud:**
- Output-shape: `Map<orderId, OrderFulfillment>` waarbij `OrderFulfillment = { orderId, orderNumber, status: 'compleet' | 'onvolledig', lines: Array<{ sampleId, needed, assigned }>, legacyLineCount }`.
- Algoritme: itereer `vb.openOrders` in volgorde (FIFO). Per regel: `assigned = min(needed, beschikbaar)` waar `beschikbaar` = `finishedStock - reedsToegewezen` per StockKey. Decrementeer een werk-Map.
- Order is `compleet` ⇔ elke regel `assigned == needed` ⇔ `legacyLineCount == 0` (regels met legacy `bundle_id`-only tellen niet mee voor 'compleet' — wel zichtbaar in `legacyLineCount`).

**Tests** (`fulfillability.test.ts`, stijl van `planning.test.ts` met factory-helpers):
1. Lege voorraad → alle orders `onvolledig`, alle `assigned = 0`.
2. FIFO: order met eerdere `delivery_date` krijgt voorraad; volgende order met dezelfde sample krijgt rest.
3. Tie-breaker: gelijke `delivery_date`, ander `order_number` → laagste nummer eerst.
4. Order zonder `delivery_date` gaat achteraan, krijgt resterende voorraad of niets.
5. Order met `legacyLineCount > 0` exposeert die count, status volgt sample-lines.
6. Een onvolledige regel ⇒ hele order `onvolledig` (binaire status).
7. Conservation: `Σ assigned over alle orders <= Σ finishedStock` per StockKey.

**Acceptance:**
- `tsc --noEmit` + `npx eslint` schoon.
- 7 tests groen.
- Pure functie: geen `new Date()`, geen Supabase, geen mutatie van `vb`.

**Dependencies:** T001.

---

### T005 ✅ DONE
**Taak:** `orders/page.tsx` migreren naar `readVoorraadbeeld` + `buildFulfillability`.

**Discoveries:** Status-veld blijft DB-persisted (UI-badge leest `orders.status`). De manuele "Herbereken"-knop draaide eerst per-order onafhankelijk → vervangen door één Voorraadbeeld + FIFO-fulfillability die alle orders in samenhang ziet. Mapping: `compleet` → `picking_ready`, `onvolledig` → `restock_needed`. Legacy banner toont totaal van `legacyLineCount` over alle open orders. Voorraadbeeld-fetch in `loadData` parallel met bestaande Promise.all + `.catch(() => null)` zodat snapshot-fout de orderlijst niet blokkeert.

**Inhoud:**
- Vervang ad-hoc `Map<stockKey, finished>` opbouw + per-order check (regels ~268-298) door één `readVoorraadbeeld` + `buildFulfillability(vb)`.
- Gebruik `OrderFulfillment.status` (`compleet`/`onvolledig`) voor de UI-badge die nu via `picking_ready`/`restock_needed` werkt.
- Banner als `legacyLineCount > 0` (analoog aan `getOrderFulfillment`-pattern in order-detail).
- Visueel/copy ongewijzigd; alleen de bron van de status verandert.

**Acceptance:**
- `tsc --noEmit` schoon.
- `npm run dev` start; orderlijst rendert; badges tonen voor minimaal één `compleet` en één `onvolledig` order met dezelfde voorraad-conflict (FIFO zichtbaar in volgorde).
- Geen regressie in bestaande tests.

**Dependencies:** T002, T004.

---

### T006
**Taak:** `orders/[id]/page.tsx` migreren naar `readVoorraadbeeld` + `buildFulfillability`.

**Inhoud:**
- Per-regel `needed`/`assigned` halen uit `OrderFulfillment.lines` ipv eigen `stockMap`-aggregatie (regels ~88-134 + 382-384).
- Bestaande legacy bundle-banner blijft werken via `legacyLineCount`.
- Andere features (in-place edit, sample-lookup) ongewijzigd.

**Acceptance:**
- `tsc --noEmit` schoon.
- Order-detail rendert per regel `needed` en `assigned`.
- `getOrderFulfillment`-aanroep voor klant-context blijft (die seam dekt ander domein); alleen de stock-aggregatie verandert.

**Dependencies:** T002, T004.

---

### T007 ✅ DONE
**Taak:** `buildSampleState(vb)` pure compute-functie in `src/lib/voorraadbeeld/sample-state.ts` + tests.

**Discoveries:** `buildSampleState(vb)` delegeert naar `buildSampleStateFromFulfillment(vb, buildFulfillability(vb))`. Pre-aggregatie van `reserved` per `sampleId` in één pass over de fulfillment-Map (O(orders·lines) i.p.v. O(samples·orders·lines)). Edge-case 5: FIFO kan geen negatieve `available` produceren (`assigned ≤ finished` per stockKey is invariant van T004), dus test 5 verifieert `available = 0`-grens met `belowMinimum=true`. 5 tests groen.

**Inhoud:**
- Output: `Map<sampleId, SampleState>` waarbij `SampleState = { sampleId, articleNumber, finished, reserved, available, belowMinimum }`.
- `reserved` = som van `assigned` uit `buildFulfillability` voor die `stockKey` (sample-state hangt af van fulfillability; herberekent intern of accepteert resultaat als optionele input voor performance — kies herberekening voor module-onafhankelijkheid, maar exporteer ook `buildSampleStateFromFulfillment(vb, fulfillment)` als convenience).
- `available = finished - reserved`.
- `belowMinimum = available <= minStock` (zelfde semantiek als huidige stalen-pagina amber-state).

**Tests** (`sample-state.test.ts`):
1. `reserved + available = finished` invariant.
2. `belowMinimum`-flag: triggert op `available <= minStock`.
3. Sample zonder open orders: `reserved = 0`, `available = finished`.
4. Sample met meerdere overlappende orders: `reserved` = som over alle FIFO-toewijzingen voor die key.
5. Negatieve `available` mag (over-committed) — `belowMinimum = true`, geen exception.

**Acceptance:**
- `tsc --noEmit` + `npx eslint` schoon.
- 5 tests groen.

**Dependencies:** T001 (en intern ook T004's algoritme; testen importeren beide modules).

---

### T008
**Taak:** `stalen/page.tsx` migreren naar `readVoorraadbeeld` + `buildSampleState`.

**Inhoud:**
- Vervang `rawSumMap`/`boSumMap`-opbouw + bundle-expansie (regels ~149-203) door `buildSampleState(vb)`.
- **Niet** in scope: legacy bundle-expansie verwijderen (apart traject — Out-of-Scope-punt 2 van issue). De ad-hoc bundle-loop blijft staan tot drop-migratie; sample-state vult alleen de niet-bundle backorder.
- Concrete invulling: `vrij = sampleState.available - legacyBundleBackorder`. Zo is sample-driven gedrag correct én blijft legacy-zichtbaarheid intact.
- Warning-states (negatief = rood, `vrij <= min_stock` = amber) ongewijzigd.

**Acceptance:**
- `tsc --noEmit` schoon.
- Stalenpagina rendert; voor een sample zonder bundles is `vrij` identiek aan oude berekening (manueel verifieerbaar).
- Geen regressie in bestaande tests.

**Dependencies:** T002, T007.

---

### T009
**Taak:** `productie/page.tsx` migreren naar `readVoorraadbeeld` + `buildShortagesFromVoorraadbeeld`.

**Inhoud:**
- Vervang `PlanningRawData`-fetches en handmatige Maps-opbouw (regels ~83-163) door `readVoorraadbeeld` + `buildShortagesFromVoorraadbeeld(vb, { leadTimeDays })`.
- `planWeeks` en `computePlan` blijven onveranderd (krijgen dezelfde `ShortageRow[]`).
- Pseudo-week-9999-gedrag voor orders zonder leverdatum blijft werken (verifieer in productie-pagina dat `OrderDemand.deliveryDate = null` correct doorstroomt).

**Acceptance:**
- `tsc --noEmit` schoon.
- Productie-pagina rendert; tekorten + weekplan visueel identiek aan vóór de migratie voor dezelfde voorraadtoestand (User Story 4).
- Alle 11+ tests in `planning.test.ts` groen.
- Tier 3-gate (`tsc --noEmit` + `eslint --max-warnings 0` + `vitest run`) groen.

**Dependencies:** T002, T003.
