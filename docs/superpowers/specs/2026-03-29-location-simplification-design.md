# Locatie-vereenvoudiging: `samples.location` als enige bron

**Datum:** 2026-03-29
**Status:** Goedgekeurd
**Doel:** 3 locatiesystemen terugbrengen naar 1 (`samples.location`), zodat locatie-informatie nooit uit sync kan raken.

## Context

Er zijn momenteel 3 onafhankelijke locatiebronnen:
1. `samples.location` — tekstveld op het sample (format `X-00-00`)
2. `*_stock.location_id` — FK naar `locations` tabel op finished_stock, bundle_stock, raw_stock
3. `locations` tabel — master-tabel met gang/rek/niveau

Deze systemen leven apart en raken uit sync. De klant wil 1 plek voor locatie.

## Beslissing

- **`samples.location`** wordt de enige locatiebron. Elk sample (kwaliteit + kleur + maat) heeft max 1 locatie.
- **`finished_stock`** blijft bestaan voor hoeveelheden, maar `location_id` wordt niet meer actief gebruikt in de UI.
- **`raw_stock`**, **`bundle_stock`**, **`locations`** tabel worden niet meer gelezen door de UI.

## Wat verandert

### Database (SQL-migratie)

1. **`v_pipeline_status` view** herscrhijven: `raw_stock` en locatie-joins verwijderen, `samples.location` meenemen
2. **`finished_stock`** bestaande rijen consolideren: meerdere rijen per quality+color+dim+finishing (verschillende locations) samenvoegen naar 1 rij per combinatie
3. Vaste "default" location aanmaken als dat nog niet bestaat (voor nieuwe finished_stock inserts)

### UI-componenten

| Component | Wijziging |
|---|---|
| `quick-entry-modal.tsx` | Stap 3 (locatiekeuze) verwijderen. Direct `finished_stock` schrijven i.p.v. `finishing_batches`. |
| `finishing-modal.tsx` | Locatieveld verwijderen. Vaste default `location_id` gebruiken. |
| `sample-form-modal.tsx` | Stock-locatie breakdown verwijderen. Alleen totaal tonen. `finished_stock` schrijven met vaste `location_id`. |
| `excel-import-modal.tsx` | Al op default location — geen wijziging nodig. |
| `packing-slip.tsx` | `bundle_stock` + `finished_stock` fallback verwijderen. Alleen `samples.location` lezen (al in query via bundle_items). Voor old-style bundels: samples opvragen. |
| `bundel-stock-tab.tsx` | `locations(label)` join verwijderen. Locatie tonen vanuit gekoppelde samples. |
| `collectie-stock-tab.tsx` | Idem als bundel-stock-tab. |
| `pipeline-view.tsx` | `raw_stock` query verwijderen. |
| `stalen/page.tsx` | `finished_stock` query: locations-join verwijderen (aggregeert al per q+c+d). |
| `productie/page.tsx` | Geen wijziging (aggregeert al zonder locatie). |
| `orders/[id]/page.tsx` | Geen wijziging (checkt finished_stock zonder locatie). |
| `sales/delivery/page.tsx` | `raw_stock_locations` kolom verwijderen uit UI. |

### Verwijderen / ongebruikt

- `LocationPicker` component (`src/components/location-picker.tsx`) — nergens geïmporteerd, kan weg
- `locations` tabel — blijft in DB bestaan maar wordt niet meer gelezen door UI
- `raw_stock` — niet meer gelezen door UI
- `bundle_stock` locatie-kolom — niet meer gelezen (hoeveelheid nog wel, indien nodig)

## Niet vergeten

1. **Database triggers** — als er triggers zijn op `finishing_batches` die `finished_stock` updaten, moeten die blijven werken OF de quick-entry schrijft direct naar `finished_stock`
2. **RLS policies** — controleren dat directe `finished_stock` writes toegestaan zijn voor production/admin rollen
3. **`src/lib/supabase/types.ts`** — updaten na schema-wijzigingen
4. **`v_pipeline_status` view** — moet hergeschreven worden
5. **Consolidatie-migratie** — bestaande finished_stock rijen met verschillende location_ids samenvoegen

## Risico's

- **Finishing_batches trigger**: als quick-entry stopt met `finishing_batches` schrijven en direct naar `finished_stock` gaat, verlies je de audit trail. Overweeg `finishing_batches` te blijven schrijven maar de trigger aan te passen.
- **Bestaande data**: consolidatie van finished_stock rijen kan data verliezen als er rijen zijn met dezelfde q+c+d+ft maar verschillende locations. Migratie moet quantities optellen.
