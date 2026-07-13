// Eenmalige correctie (verzoek Miguel 13-07), draait tegen de LIVE app:
//
//  A. VOLLMERT (DE, STL-2026-028, €145,20 incl. 21%): Duitse klant met btw-nr →
//     had 0% moeten zijn. Volledig crediteren → factuur vervangen → nieuwe
//     0%-ICL-factuur op dezelfde order.
//  B. BENJAMIN FURNITURE (NL, STL-2026-007): klant wacht op de creditnota voor de
//     Mart Visser-stofstalen (regelcredit €599 excl = €724,79 incl). RACCOONN-regel
//     (€40) blijft staan — die is niet gecrediteerd gevraagd.
//
// Dit script maakt alléén de documenten aan (geen mail — dat gebeurt pas na akkoord).
// Draaien: npx tsx scripts/_correctie-vollmert-benjamin.mts
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = "https://karpi-b-vstalen.vercel.app";
const PROJECT_REF = new URL(SUPA_URL).hostname.split(".")[0];
const OPERATOR_EMAIL = "correctie-operator@test.local";

const admin = createClient(SUPA_URL, SERVICE_KEY);
const ok = (m: string) => console.log(`✅ ${m}`);
const fail = (m: string): never => { throw new Error(`❌ ${m}`); };
const eur = (c: number) => `€ ${(c / 100).toFixed(2)}`;

function authHeaders(session: { access_token: string }): Record<string, string> {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const name = `sb-${PROJECT_REF}-auth-token`;
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += 3180) chunks.push(value.slice(i, i + 3180));
  const cookie = chunks.length === 1 ? `${name}=${chunks[0]}`
    : chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");
  return { Cookie: cookie, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
}

async function post(path: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(`${APP_URL}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json } as { status: number; json: Record<string, string> };
}

// tijdelijke operator-account met admin-rol (rol-gate op alle routes)
const pw = `Op-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const { data: user, error: uErr } = await admin.auth.admin.createUser({
  email: OPERATOR_EMAIL, password: pw, email_confirm: true, app_metadata: { role: "admin" },
});
if (uErr) fail(`operator aanmaken: ${uErr.message}`);

try {
  const anon = createClient(SUPA_URL, ANON_KEY);
  const { data: signIn, error: sErr } = await anon.auth.signInWithPassword({ email: OPERATOR_EMAIL, password: pw });
  if (sErr || !signIn.session) fail(`inloggen: ${sErr?.message}`);
  const headers = authHeaders(signIn.session!);

  // ─────────────────────────────── A. VOLLMERT ───────────────────────────────
  const { data: vollmert } = await admin.from("invoices")
    .select("id, order_id, client_id, subtotal_cents, btw_cents, total_cents, superseded_at")
    .eq("invoice_number", "STL-2026-028").single();
  if (!vollmert) fail("STL-2026-028 niet gevonden");
  if (vollmert!.superseded_at) fail("STL-2026-028 is al vervangen — script al eerder gedraaid?");

  const { data: vLines } = await admin.from("invoice_lines")
    .select("id, quantity, description").eq("invoice_id", vollmert!.id);
  if (!vLines?.length) fail("STL-2026-028 heeft geen regel-snapshot");

  const vCredit = await post("/api/invoices/credit", headers, {
    invoiceId: vollmert!.id,
    lineCredits: vLines!.map((l) => ({ lineId: l.id, quantity: Number(l.quantity) })),
    reason: "Correctie: Duitse afnemer met btw-nummer — factuur had 0% (intracommunautaire levering) moeten zijn.",
  });
  if (vCredit.status !== 200) fail(`Vollmert credit: ${vCredit.status} ${JSON.stringify(vCredit.json)}`);
  ok(`Vollmert creditnota ${vCredit.json.invoiceNumber} (${eur(-vollmert!.total_cents)} → gecrediteerd)`);

  const vSup = await post(`/api/invoices/${vollmert!.id}/supersede`, headers, {});
  if (vSup.status !== 200) fail(`Vollmert supersede: ${vSup.status} ${JSON.stringify(vSup.json)}`);
  ok("STL-2026-028 gemarkeerd als vervangen");

  const vNew = await post("/api/invoices/create", headers, {
    orderId: vollmert!.order_id, clientId: vollmert!.client_id, btwPct: 0,
  });
  if (vNew.status !== 200) fail(`Vollmert nieuwe factuur: ${vNew.status} ${JSON.stringify(vNew.json)}`);
  const vNewInv = (vNew.json as unknown as { invoice: { id: string; invoice_number: string; subtotal_cents: number; btw_cents: number; total_cents: number } }).invoice;
  if (vNewInv.btw_cents !== 0) fail(`nieuwe Vollmert-factuur heeft btw ${vNewInv.btw_cents} — verwacht 0`);
  ok(`Vollmert nieuwe 0%-factuur ${vNewInv.invoice_number}: subtotaal ${eur(vNewInv.subtotal_cents)}, btw ${eur(vNewInv.btw_cents)}, totaal ${eur(vNewInv.total_cents)}`);

  // ────────────────────────────── B. BENJAMIN ──────────────────────────────
  const { data: benjamin } = await admin.from("invoices")
    .select("id, total_cents").eq("invoice_number", "STL-2026-007").single();
  if (!benjamin) fail("STL-2026-007 niet gevonden");

  const { data: bLines } = await admin.from("invoice_lines")
    .select("id, quantity, description, amount_cents").eq("invoice_id", benjamin!.id);
  const martVisser = bLines?.find((l) => l.description.toLowerCase().includes("mart visser"));
  if (!martVisser) throw new Error("❌ Mart Visser-regel niet gevonden op STL-2026-007");
  if (martVisser.amount_cents !== 59900) fail(`Mart Visser-regel is ${martVisser.amount_cents} cent — verwacht 59900`);

  const bCredit = await post("/api/invoices/credit", headers, {
    invoiceId: benjamin!.id,
    lineCredits: [{ lineId: martVisser.id, quantity: Number(martVisser.quantity) }],
    reason: "Creditering stofstalen Mart Visser (annulering, conform afspraak).",
  });
  if (bCredit.status !== 200) fail(`Benjamin credit: ${bCredit.status} ${JSON.stringify(bCredit.json)}`);
  const { data: bCreditRow } = await admin.from("invoices")
    .select("total_cents").eq("id", bCredit.json.creditInvoiceId).single();
  ok(`Benjamin creditnota ${bCredit.json.invoiceNumber}: ${eur(bCreditRow!.total_cents)} (Mart Visser-regel; RACCOONN blijft staan)`);

  console.log("\n— DOCUMENTEN AANGEMAAKT (nog niet gemaild) —");
  console.log(JSON.stringify({
    vollmert_creditnota: vCredit.json.invoiceNumber,
    vollmert_nieuwe_factuur: vNewInv.invoice_number,
    benjamin_creditnota: bCredit.json.invoiceNumber,
    ids: {
      vollmertCreditId: vCredit.json.creditInvoiceId,
      vollmertNewId: vNewInv.id,
      benjaminCreditId: bCredit.json.creditInvoiceId,
    },
  }, null, 2));
} finally {
  if (user?.user) await admin.auth.admin.deleteUser(user.user.id);
  console.log("\n(operator-account opgeruimd)");
}
