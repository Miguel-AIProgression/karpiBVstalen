# Frontend Architectuur

## Stack
- Next.js 16+ (App Router, Turbopack)
- TypeScript
- Tailwind CSS v4
- shadcn/ui v4 (base-nova style, @base-ui/react primitives)
- Supabase JS Client (@supabase/ssr)

## Route Structuur
```
/                   → role-based redirect
/login              → login pagina
/production/*       → productie dashboard (snijden, afwerken, bundelen, locaties)
/sales/*            → verkoop dashboard (beschikbaarheid, levertijden)
/management/*       → management dashboard (overzicht, KPI's)
```

## Auth
- `AuthProvider` in root layout, leest `app_metadata.role` uit JWT
- `useAuth()` hook geeft `user`, `role`, `loading`
- Rollen: `production`, `sales`, `admin`

## Componenten Patronen
- `NavSidebar` — rolgebaseerde navigatie, past zich aan per rol
- Layout per dashboard-sectie wraps `<NavSidebar />` + `<main>`
- Supabase client via `createClient()` uit `@/lib/supabase/client`
- Server-side via `createClient()` uit `@/lib/supabase/server`

## Conventies
- shadcn componenten in `src/components/ui/`
- Custom componenten in `src/components/`
- Nederlandse UI-teksten (labels, buttons, placeholders)
- Supabase types in `src/lib/supabase/types.ts` (placeholder, later genereren)
