# Architectuurbeslissingen & Inzichten

## Beslissingen
- **Variant = combinatie**: Staaltje-varianten worden niet apart opgeslagen, maar berekend uit regels
- **Triggers voor voorraad**: Database triggers houden stock-tabellen consistent (niet applicatielogica)
- **Bundel-configs als templates**: Standaard + klant-specifieke bundels via dezelfde structuur
- **Schema nu, CRUD later**: Klant/prijzen-tabellen bestaan al, maar frontend-beheer komt in fase 3
- **Rollen via app_metadata**: Geen aparte user_roles tabel, role zit in Supabase JWT

## Geleerde lessen
<!-- Voeg hier inzichten toe die tijdens development opdoen -->
<!-- Voorbeeld: "shadcn v4 gebruikt base-nova style met @base-ui/react, niet Radix" -->
- shadcn v4 (base-nova) gebruikt `@base-ui/react` primitives ipv Radix — componenten werken anders dan shadcn v2 docs
- Next.js 16 scaffoldt met Turbopack standaard
