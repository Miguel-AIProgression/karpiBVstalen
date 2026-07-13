// Verstuurt de drie correctie-documenten naar de KLANTEN (akkoord Miguel 13-07),
// met phdobbe@karpi.nl in de BCC. Gebruikt de live email-route (Graph draait op
// Vercel), die de PDF snapshot-first rendert en sent_at registreert.
//   STL-2026-049  creditnota Vollmert (-€145,20)
//   STL-2026-050  nieuwe 0%-ICL-factuur Vollmert (€120,00)
//   STL-2026-051  creditnota Benjamin Furniture (-€724,79, Mart Visser)
// Draaien: npx tsx scripts/_verstuur-correctie-mails.mts
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = "https://karpi-b-vstalen.vercel.app";
const PROJECT_REF = new URL(SUPA_URL).hostname.split(".")[0];
const BCC = "phdobbe@karpi.nl";
const OPERATOR_EMAIL = "mail-operator@test.local";
const DOCUMENTEN = ["STL-2026-049", "STL-2026-050", "STL-2026-051"];

const admin = createClient(SUPA_URL, SERVICE_KEY);

function authHeaders(session: { access_token: string }): Record<string, string> {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const name = `sb-${PROJECT_REF}-auth-token`;
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += 3180) chunks.push(value.slice(i, i + 3180));
  const cookie = chunks.length === 1 ? `${name}=${chunks[0]}`
    : chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");
  return { Cookie: cookie, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
}

const pw = `Ml-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const { data: user, error: uErr } = await admin.auth.admin.createUser({
  email: OPERATOR_EMAIL, password: pw, email_confirm: true, app_metadata: { role: "admin" },
});
if (uErr) throw new Error(`operator aanmaken: ${uErr.message}`);

try {
  const anon = createClient(SUPA_URL, ANON_KEY);
  const { data: signIn, error: sErr } = await anon.auth.signInWithPassword({ email: OPERATOR_EMAIL, password: pw });
  if (sErr || !signIn.session) throw new Error(`inloggen: ${sErr?.message}`);
  const headers = authHeaders(signIn.session);

  for (const nr of DOCUMENTEN) {
    const { data: inv, error } = await admin.from("invoices")
      .select("id, invoice_number, total_cents, credited_invoice_id").eq("invoice_number", nr).single();
    if (error || !inv) throw new Error(`${nr}: niet gevonden`);

    const res = await fetch(`${APP_URL}/api/invoices/email`, {
      method: "POST", headers, body: JSON.stringify({ invoiceId: inv.id, bcc: BCC }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status !== 200) throw new Error(`${nr} mailen mislukt: ${res.status} ${JSON.stringify(json)}`);

    const { data: after } = await admin.from("invoices").select("sent_at").eq("id", inv.id).single();
    const soort = inv.credited_invoice_id ? "Creditnota" : "Factuur";
    console.log(`✅ ${soort} ${nr} (€ ${(inv.total_cents / 100).toFixed(2)}) → ${json.to} | bcc ${BCC} | sent_at=${after?.sent_at}`);
    if (json.warning) console.log(`   ⚠️  ${json.warning}`);
  }
  console.log("\n— ALLE CORRECTIEDOCUMENTEN VERSTUURD —");
} finally {
  if (user?.user) await admin.auth.admin.deleteUser(user.user.id);
  console.log("(operator-account opgeruimd)");
}
