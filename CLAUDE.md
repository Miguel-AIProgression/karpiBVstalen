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
├── supabase/migrations/          # SQL migrations (008-012 voor nieuw schema)
├── src/app/
│   ├── login/                    # Auth login
│   ├── auth/callback/            # OAuth callback
│   └── (app)/                    # Route group (AuthProvider + sidebar)
│       ├── orders/               # Orders overzicht + detail
│       ├── stalen/               # Stalen + Voorraad + snelle invoer
│       ├── collecties/           # Collecties & Bundels tabs
│       ├── productie/            # Tekorten-overzicht (berekend)
│       └── klanten/              # Klantbeheer + prijzen + logo
├── src/components/               # Gedeelde componenten
│   ├── ui/                       # shadcn/ui (auto-generated)
│   ├── auth/                     # Auth provider
│   ├── app-sidebar.tsx           # Platte 5-item sidebar
│   ├── quick-entry-modal.tsx     # Snelle voorraad invoer
│   ├── sticker-print.tsx         # Sticker generatie + print
│   └── ...                       # Overige modals/componenten
├── src/lib/supabase/             # Supabase clients + types
└── docs/                         # Architectuurdocs
```

## Architectuur Referenties
- Database schema: `docs/architecture/database.md`
- Frontend structuur: `docs/architecture/frontend.md`
- Beslissingen: `docs/architecture/decisions.md`
- Vereenvoudigde 5-pagina spec: `docs/superpowers/specs/2026-03-25-simplified-5-page-app-design.md`
- Implementatieplan: `docs/superpowers/plans/2026-03-25-simplified-5-page-app.md`

## Kernregels
1. **`samples` tabel** materialiseert stalen (quality + color + dimension + foto + min_stock + **location**)
2. **`samples.location`** is de enige locatiebron (format `X-00-00`). Hoeveelheden in `finished_stock`.
3. **Rollen** via `app_metadata.role` in Supabase JWT (`production`, `sales`, `admin`)
4. **Nederlandse UI-teksten** in alle labels, buttons, placeholders
5. **shadcn v4 base-nova** gebruikt `@base-ui/react` — niet Radix
6. **Carpet dimensions** (tapijtmaten) zijn apart van sample dimensions (staalmaten)
7. **`locations` tabel** wordt niet meer actief gelezen door de UI — alleen als FK voor `finished_stock`

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
- [x] Orders, Stalen+Voorraad, Collecties&Bundels, Productie, Klanten
- [x] Sticker-systeem voor klant-specifieke labels
- [x] Locatie-vereenvoudiging: `samples.location` als enige bron (maart 2026)
- [ ] Migratie `20260329_location_simplification.sql` nog uitvoeren in Supabase
- [ ] Styling/layout fixes nodig
- [ ] Sticker printer API-integratie (toekomst)

## Zelflerende instructie
> Bij elke grote wijziging:
> 1. Update dit bestand als de wijziging de kernstructuur raakt
> 2. Update het relevante bestand in `docs/architecture/` voor details
> 3. Voeg geleerde lessen toe aan `docs/architecture/decisions.md`
> Dit bestand mag MAXIMAAL 100 regels zijn. Verwijs naar subdocs voor details.
