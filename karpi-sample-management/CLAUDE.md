# Karpi Staaltjesbeheer — CLAUDE.md

## Wat is dit project?
Intern voorraadbeheersysteem voor Karpi BV (tapijt-staaltjes). Pipeline: snijden → afwerken → bundelen.
Drie gebruikersrollen: productie, verkoop, management. Max ~10 gebruikers.

## Tech Stack
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Frontend:** Next.js 16+ (App Router), TypeScript, Tailwind CSS v4, shadcn/ui v4 (base-nova)
- **Hosting:** Vercel
- **Taal UI:** Nederlands

## Projectstructuur
```
karpi-sample-management/
├── supabase/migrations/          # 7 SQL migrations (001-007)
├── src/app/                      # Next.js App Router pages
│   ├── login/                    # Auth
│   ├── production/               # Productie dashboard + subpages
│   ├── sales/                    # Verkoop dashboard + subpages
│   └── management/               # Management dashboard
├── src/components/               # Gedeelde componenten
│   ├── ui/                       # shadcn/ui (auto-generated)
│   └── auth/                     # Auth provider
├── src/lib/supabase/             # Supabase clients + types
└── docs/                         # Architectuurdocs
```

## Architectuur Referenties
- Database schema & pipeline: `docs/architecture/database.md`
- Frontend structuur & conventies: `docs/architecture/frontend.md`
- Beslissingen & geleerde lessen: `docs/architecture/decisions.md`
- Design spec: `docs/superpowers/specs/2026-03-19-karpi-sample-management-design.md`
- Implementatieplan: `docs/superpowers/plans/2026-03-19-karpi-sample-management.md`

## Kernregels
1. **Database triggers** beheren voorraad — NIET de applicatielogica
2. **Variant = combinatie** van kwaliteit + kleur + afwerking + maat (niet apart opgeslagen)
3. **Rollen** via `app_metadata.role` in Supabase JWT (`production`, `sales`, `admin`)
4. **Nederlandse UI-teksten** in alle labels, buttons, placeholders
5. **shadcn v4 base-nova** gebruikt `@base-ui/react` — niet Radix

## Supabase toegang
- Supabase project staat op **klant-account** (niet op ons MCP-account)
- Credentials staan in `.env.local` (project `mbqvhpdwtgtfbnscqrul`)
- Gebruik de **Supabase REST API** (PostgREST) of **SQL via `curl`** voor data-queries, NIET de MCP Supabase tools

## Commando's
```bash
npm run dev          # Start dev server
npm run build        # Production build
npx supabase db push # Push migrations naar Supabase
```

## Huidige status
- [x] Fase 1+2: Productstructuur & Voorraadbeheer (in progress)
- [ ] Fase 3: Bundel-configuratie & klantbeheer (CRUD frontend)
- [ ] Fase 4: Ordermanagement
- [ ] Fase 5: Productie & planning
- [ ] Fase 6: Automatisering inkomende orders
- [ ] Fase 7: Meldingen & drempelwaarden

## Zelflerende instructie
> Bij elke grote wijziging (nieuwe fase, architectuurwijziging, nieuw patroon, probleem + oplossing):
> 1. Update dit bestand als de wijziging de kernstructuur raakt
> 2. Update het relevante bestand in `docs/architecture/` voor details
> 3. Voeg geleerde lessen toe aan `docs/architecture/decisions.md`
> Dit bestand mag MAXIMAAL 100 regels zijn. Verwijs naar subdocs voor details.
