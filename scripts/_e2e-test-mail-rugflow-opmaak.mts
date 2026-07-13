// Eenmalige livetest (verzoek Miguel 12-07 avond): één testfactuur aanmaken via de
// LIVE app, mailen, volledig crediteren, creditnota mailen — beide in de nieuwe
// RugFlow-opmaak, naar miguel@aiprogression.nl. Daarna testdata opruimen
// (sent_at-NULL-omweg voor de delete-trigger; reeks herstelt via MAX+1).
// Draaien: npx tsx scripts/_e2e-test-mail-rugflow-opmaak.mts
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = "https://karpi-b-vstalen.vercel.app";
const PROJECT_REF = new URL(SUPA_URL).hostname.split(".")[0];
const MAIL_TO = "miguel@aiprogression.nl";
const TEST_CLIENT_NR = "99997";
const TEST_USER_EMAIL = "test-mail-opmaak@test.local";

const admin = createClient(SUPA_URL, SERVICE_KEY);
const ok = (msg: string) => console.log(`✅ ${msg}`);
const fail = (msg: string): never => { throw new Error(`❌ ${msg}`); };

function authHeaders(session: { access_token: string }): Record<string, string> {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const name = `sb-${PROJECT_REF}-auth-token`;
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += 3180) chunks.push(value.slice(i, i + 3180));
  const cookie = chunks.length === 1
    ? `${name}=${chunks[0]}`
    : chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");
  return { Cookie: cookie, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
}

async function cleanup() {
  const { data: clients, error } = await admin.from("clients").select("id").eq("client_number", TEST_CLIENT_NR);
  if (error) throw error;
  for (const c of clients ?? []) {
    // gemailde rijen: eerst sent_at los, anders blokkeert de delete-trigger (bewust, met eerder akkoord-patroon)
    const { error: rErr } = await admin.from("invoices").update({ sent_at: null }).eq("client_id", c.id);
    if (rErr) throw rErr;
    const { data: invs, error: iErr } = await admin.from("invoices").select("id, credited_invoice_id").eq("client_id", c.id);
    if (iErr) throw iErr;
    for (const i of (invs ?? []).filter((x) => x.credited_invoice_id)) {
      const { error: e } = await admin.from("invoices").delete().eq("id", i.id); if (e) throw e;
    }
    for (const i of (invs ?? []).filter((x) => !x.credited_invoice_id)) {
      const { error: e } = await admin.from("invoices").delete().eq("id", i.id); if (e) throw e;
    }
    const { data: orders } = await admin.from("orders").select("id").eq("client_id", c.id);
    for (const o of orders ?? []) await admin.from("order_lines").delete().eq("order_id", o.id);
    const { error: oErr } = await admin.from("orders").delete().eq("client_id", c.id); if (oErr) throw oErr;
    const { error: cErr } = await admin.from("clients").delete().eq("id", c.id); if (cErr) throw cErr;
  }
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const u of users?.users ?? []) {
    if (u.email === TEST_USER_EMAIL) await admin.auth.admin.deleteUser(u.id);
  }
}

try {
  await cleanup();

  // — testdata: klant + order met echte sample-regels —
  const { data: client, error: cErr } = await admin.from("clients")
    .insert({ name: "TESTKLANT mail-opmaak (auto-verwijderd)", client_number: TEST_CLIENT_NR, client_type: "wholesaler" })
    .select("id").single();
  if (cErr) fail(`client: ${cErr.message}`);

  const { data: samples } = await admin.from("samples").select("id").limit(2);
  if (!samples || samples.length < 2) fail("te weinig samples voor testregels");

  const { data: order, error: oErr } = await admin.from("orders")
    .insert({ client_id: client!.id, status: "completed", delivery_date: "2026-07-12", email_invoice: MAIL_TO, reference: "Test nieuwe opmaak" })
    .select("id, order_number").single();
  if (oErr) fail(`order: ${oErr!.message}`);
  await admin.from("order_lines").insert([
    { order_id: order!.id, sample_id: samples![0].id, quantity: 2, price_cents: 1500 },
    { order_id: order!.id, sample_id: samples![1].id, quantity: 1, price_cents: 2500 },
  ]);

  // — admin-JWT —
  const pw = `Tm-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const { error: uErr } = await admin.auth.admin.createUser({
    email: TEST_USER_EMAIL, password: pw, email_confirm: true, app_metadata: { role: "admin" },
  });
  if (uErr) fail(`testuser: ${uErr.message}`);
  const anon = createClient(SUPA_URL, ANON_KEY);
  const { data: signIn, error: sErr } = await anon.auth.signInWithPassword({ email: TEST_USER_EMAIL, password: pw });
  if (sErr || !signIn.session) fail(`inloggen: ${sErr?.message}`);
  const headers = authHeaders(signIn.session!);

  // 1. factuur aanmaken via de live create-route (echte regels + snapshot + nieuw STL-nummer)
  const createRes = await fetch(`${APP_URL}/api/invoices/create`, {
    method: "POST", headers, body: JSON.stringify({ orderId: order!.id, clientId: client!.id, btwPct: 21 }),
  });
  const createJson = await createRes.json();
  if (createRes.status !== 200) fail(`create: ${createRes.status} ${JSON.stringify(createJson)}`);
  const invoiceId = createJson.invoice.id as string;
  ok(`Factuur ${createJson.invoice.invoice_number} aangemaakt (€ ${(createJson.invoice.total_cents / 100).toFixed(2)})`);

  // 2. factuur mailen (nieuwe RugFlow-PDF)
  const mail1 = await fetch(`${APP_URL}/api/invoices/email`, {
    method: "POST", headers, body: JSON.stringify({ invoiceId }),
  });
  const mail1Json = await mail1.json();
  if (mail1.status !== 200) fail(`factuur-mail: ${mail1.status} ${JSON.stringify(mail1Json)}`);
  ok(`Factuur gemaild naar ${mail1Json.to}`);

  // 3. volledig crediteren via de live credit-route
  const { data: lines } = await admin.from("invoice_lines").select("id, quantity").eq("invoice_id", invoiceId);
  const credRes = await fetch(`${APP_URL}/api/invoices/credit`, {
    method: "POST", headers,
    body: JSON.stringify({
      invoiceId,
      lineCredits: (lines ?? []).map((l) => ({ lineId: l.id, quantity: Number(l.quantity) })),
      reason: "Testcreditnota nieuwe factuuropmaak",
    }),
  });
  const credJson = await credRes.json();
  if (credRes.status !== 200) fail(`credit: ${credRes.status} ${JSON.stringify(credJson)}`);
  ok(`Creditnota ${credJson.invoiceNumber} aangemaakt`);

  // 4. creditnota mailen
  const mail2 = await fetch(`${APP_URL}/api/invoices/email`, {
    method: "POST", headers, body: JSON.stringify({ invoiceId: credJson.creditInvoiceId }),
  });
  const mail2Json = await mail2.json();
  if (mail2.status !== 200) fail(`credit-mail: ${mail2.status} ${JSON.stringify(mail2Json)}`);
  const { data: credRow } = await admin.from("invoices").select("sent_at, total_cents").eq("id", credJson.creditInvoiceId).single();
  ok(`Creditnota gemaild naar ${mail2Json.to} (total ${credRow!.total_cents}, sent_at=${credRow!.sent_at})`);

  console.log("\n— BEIDE MAILS VERSTUURD —");
} finally {
  await cleanup();
  const { data: maxRow } = await admin.from("invoices").select("invoice_number").like("invoice_number", "STL-2026-%").order("invoice_number", { ascending: false }).limit(1);
  const { count } = await admin.from("clients").select("*", { count: "exact", head: true }).eq("client_number", TEST_CLIENT_NR);
  console.log(`Opruiming: testclients over=${count}; hoogste echte STL: ${maxRow?.[0]?.invoice_number}`);
}
