// Server-side rol-gate voor API-routes (wayfinder-ticket 006). Vóór deze module bestond
// er geen server-side rol-check — routes vertrouwden op de client-side AuthProvider.
//
// Tokenbron (in volgorde): eerst `Authorization: Bearer <jwt>` (maakt route-handlers
// testbaar zonder cookie-jar), anders de Supabase-sessie uit de request-cookies via
// @supabase/ssr. Bewust NextRequest.cookies i.p.v. `cookies()` uit next/headers — dat
// laatste is alleen bruikbaar binnen een echte request-context en maakt de handler
// niet direct aanroepbaar in tests (zie middleware.ts voor hetzelfde cookie-patroon,
// daar met request.cookies i.p.v. hier NextRequest.cookies — functioneel identiek).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

export type AppRole = "production" | "sales" | "admin";

export async function requireRole(
  req: NextRequest,
  roles: AppRole[]
): Promise<{ user: User; role: AppRole } | NextResponse> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        // Route-handler leest alleen; er is geen response om ververste cookies op te zetten.
        setAll() {},
      },
    }
  );

  const bearerToken = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];

  const { data, error } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();

  const user = data?.user;
  if (error || !user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const role = user.app_metadata?.role as AppRole | undefined;
  if (!role || !roles.includes(role)) {
    return NextResponse.json({ error: "Geen toestemming voor deze actie" }, { status: 403 });
  }

  return { user, role };
}
