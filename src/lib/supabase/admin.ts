import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Service-role-client (RLS-bypass) voor de API-routes. Bewust LAZY: bij
// module-scope-initialisatie evalueert `next build` dit tijdens "Collecting page
// data", en in omgevingen zonder SUPABASE_SERVICE_ROLE_KEY (o.a. Vercel-preview)
// faalt de build dan op "supabaseKey is required".
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service-role-configuratie ontbreekt op de server.");
  cached = createClient(url, key);
  return cached;
}
