# Architectuurbeslissingen & Inzichten

## Beslissingen
- **Variant = combinatie**: Staaltje-varianten worden niet apart opgeslagen, maar berekend uit regels
- **Triggers voor voorraad**: Database triggers houden stock-tabellen consistent (niet applicatielogica)
- **Bundel-configs als templates**: Standaard + klant-specifieke bundels via dezelfde structuur
- **Schema nu, CRUD later**: Klant/prijzen-tabellen bestaan al, maar frontend-beheer komt in fase 3
- **Rollen via app_metadata**: Geen aparte user_roles tabel, role zit in Supabase JWT
- **`samples.location` als enige locatiebron** (2026-03-30): 3 locatiesystemen (samples.location, *_stock.location_id, locations tabel) teruggebracht naar 1. `samples.location` (tekstveld `X-00-00`) is de enige bron. `finished_stock` houdt hoeveelheden bij maar `location_id` wordt niet meer gelezen door UI. Reden: systemen raakten uit sync, overkill voor ~10 gebruikers met 1 magazijn.
- **Pipeline vereenvoudigd** (2026-03-30): "Gesneden → Afgewerkt → Bundels" pipeline teruggebracht naar alleen "Afgewerkt + Bundels". `raw_stock` wordt niet meer gelezen. Quick-entry schrijft direct naar `finished_stock` i.p.v. `finishing_batches`.

## Geleerde lessen
<!-- Voeg hier inzichten toe die tijdens development opdoen -->
<!-- Voorbeeld: "shadcn v4 gebruikt base-nova style met @base-ui/react, niet Radix" -->
- shadcn v4 (base-nova) gebruikt `@base-ui/react` primitives ipv Radix — componenten werken anders dan shadcn v2 docs
- Next.js 16 scaffoldt met Turbopack standaard
- Locatie-vereenvoudiging: als systemen onafhankelijk dezelfde info bijhouden, kies 1 bron en verwijder de rest. Complexere normalisatie (FK naar locaties-tabel) was overkill voor deze schaal.
