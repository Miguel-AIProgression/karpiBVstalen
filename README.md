# Karpi BV — Staaltjesbeheer

Intern voorraadbeheersysteem voor Karpi BV. Beheert de volledige pipeline van tapijt-staaltjes: **snijden → afwerken → bundelen**.

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui v4
- **Backend:** Supabase (PostgreSQL, Auth, Realtime)
- **Hosting:** Vercel

## Gebruikersrollen

| Rol | Toegang |
|-----|---------|
| **Productie** | Snijden, afwerken, bundelen, locatiebeheer |
| **Verkoop** | Voorraadinzicht, beschikbaarheid, leveringen |
| **Management** | Volledig overzicht, rapportages |

## Aan de slag

```bash
cd karpi-sample-management
npm install
```

Maak een `.env.local` aan met je Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://jouw-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=jouw-anon-key
```

Start de development server:

```bash
npm run dev
```

## Projectstructuur

```
karpi-sample-management/
├── supabase/migrations/      # Database migrations
├── src/app/                  # Next.js App Router
│   ├── login/                # Authenticatie
│   ├── production/           # Productie dashboard
│   ├── sales/                # Verkoop dashboard
│   └── management/           # Management dashboard
├── src/components/           # Gedeelde componenten
├── src/lib/supabase/         # Supabase clients & types
└── docs/                     # Architectuurdocumentatie
```

## Roadmap

- [x] Productstructuur & voorraadbeheer
- [ ] Bundel-configuratie & klantbeheer
- [ ] Ordermanagement
- [ ] Productie & planning
- [ ] Automatisering inkomende orders
- [ ] Meldingen & drempelwaarden
