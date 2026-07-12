// E2E-runtime-bewijs wayfinder-ticket 006 tegen de LIVE app (karpi-b-vstalen.vercel.app).
// Maakt eigen testdata (client 99998, prefix STL-TEST-E2E-), bewijst:
//   (1) creditnota via POST /api/invoices/credit met echte admin-JWT
//   (3) credit-PDF gemaild via POST /api/invoices/email (Graph op Vercel) + sent_at
//   (5) regressie: factuur aanmaken + mailen op een order zonder credit werkt nog
// Mails gaan naar miguel@aiprogression.nl. Ruimt alles op (reeks herstelt via MAX+1).
// Draaien: npx tsx scripts/_e2e-bewijs-006.mts
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = "https://karpi-b-vstalen.vercel.app";
const PROJECT_REF = new URL(SUPA_URL).hostname.split(".")[0];
const MAIL_TO = "miguel@aiprogression.nl";

const admin = createClient(SUPA_URL, SERVICE_KEY);
const results: string[] = [];
const ok = (msg: string) => { results.push(`✅ ${msg}`); console.log(`✅ ${msg}`); };
const fail = (msg: string): never => { console.error(`❌ ${msg}`); throw new Error(msg); };

function sessionCookieHeaders(session: { access_token: string }, raw: object): Record<string, string> {
  // @supabase/ssr-formaat: sb-<ref>-auth-token = "base64-" + base64url(JSON), gechunkt per 3180 tekens
  const value = "base64-" + Buffer.from(JSON.stringify(raw)).toString("base64url");
  const name = `sb-${PROJECT_REF}-auth-token`;
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += 3180) chunks.push(value.slice(i, i + 3180));
  const cookie = chunks.length === 1
    ? `${name}=${chunks[0]}`
    : chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");
  return { Cookie: cookie, Authorization: `Bearer ${session.access_token}` };
}

async function cleanup() {
  const { data: clients } = await admin.from("clients").select("id").eq("client_number", "99998");
  for (const c of clients ?? []) {
    const { data: invs } = await admin.from("invoices").select("id, credited_invoice_id").eq("client_id", c.id);
    for (const i of (invs ?? []).filter((x) => x.credited_invoice_id)) await admin.from("invoices").delete().eq("id", i.id);
    for (const i of (invs ?? []).filter((x) => !x.credited_invoice_id)) await admin.from("invoices").delete().eq("id", i.id);
    const { data: orders } = await admin.from("orders").select("id").eq("client_id", c.id);
    for (const o of orders ?? []) await admin.from("order_lines").delete().eq("order_id", o.id);
    await admin.from("orders").delete().eq("client_id", c.id);
    await admin.from("clients").delete().eq("id", c.id);
  }
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const u of users?.users ?? []) {
    if (u.email?.includes("ticket006-e2e")) await admin.auth.admin.deleteUser(u.id);
  }
}

try {
  await cleanup();

  // — setup testdata —
  const { data: client, error: cErr } = await admin.from("clients")
    .insert({ name: "TESTKLANT e2e-006 (auto-verwijderd)", client_number: "99998", client_type: "wholesaler" })
    .select("id").single();
  if (cErr) fail(`client aanmaken: ${cErr.message}`);

  const { data: sample } = await admin.from("samples").select("id").limit(1).single();
  if (!sample) fail("geen sample gevonden voor testregel");

  async function makeOrder() {
    const { data: order, error } = await admin.from("orders")
      .insert({ client_id: client!.id, status: "completed", delivery_date: "2026-07-12", email_invoice: MAIL_TO })
      .select("id").single();
    if (error) fail(`order aanmaken: ${error.message}`);
    const { error: lErr } = await admin.from("order_lines")
      .insert({ order_id: order!.id, sample_id: sample!.id, quantity: 2, price_cents: 1500 });
    if (lErr) fail(`order_line aanmaken: ${lErr.message}`);
    return order!.id as string;
  }
  const orderCredit = await makeOrder();
  const orderRegressie = await makeOrder();

  // debetfactuur voor het credit-pad (direct, gemaild-status) + snapshot
  const { data: debit, error: dErr } = await admin.from("invoices").insert({
    invoice_number: "STL-TEST-E2E-001", order_id: orderCredit, client_id: client!.id,
    btw_pct: 21, subtotal_cents: 3000, btw_cents: 630, total_cents: 3630,
    sent_at: new Date().toISOString(),
  }).select("id").single();
  if (dErr) fail(`debetfactuur: ${dErr.message}`);
  const { data: dLine, error: dlErr } = await admin.from("invoice_lines").insert({
    invoice_id: debit!.id, line_tag: "Staal", description: "Sample: E2E-testregel",
    article_number: "E2E-1", quantity: 2, unit_price_cents: 1500, amount_cents: 3000, position: 1,
  }).select("id, quantity").single();
  if (dlErr) fail(`snapshot-regel: ${dlErr.message}`);

  // admin-testuser met echte JWT
  const pw = `E2e-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const { data: user, error: uErr } = await admin.auth.admin.createUser({
    email: "ticket006-e2e-admin@test.local", password: pw, email_confirm: true,
    app_metadata: { role: "admin" },
  });
  if (uErr) fail(`testuser: ${uErr.message}`);
  const anon = createClient(SUPA_URL, ANON_KEY);
  const { data: signIn, error: sErr } = await anon.auth.signInWithPassword({
    email: "ticket006-e2e-admin@test.local", password: pw,
  });
  if (sErr || !signIn.session) fail(`inloggen: ${sErr?.message}`);
  const headers = { ...sessionCookieHeaders(signIn.session!, signIn.session!), "Content-Type": "application/json" };

  // — wacht tot de nieuwe build live is (credit-route bestaat) —
  let live = false;
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${APP_URL}/api/invoices/credit`, {
      method: "POST", headers, body: JSON.stringify({}), redirect: "manual",
    });
    if (res.status === 400) { live = true; break; } // route bestaat + gate gepasseerd + validatie klaagt
    console.log(`   … wacht op deploy (status ${res.status}), poging ${i + 1}/30`);
    await new Promise((r) => setTimeout(r, 15000));
  }
  if (!live) fail("nieuwe build niet live na 7,5 min");
  ok("Nieuwe build live: credit-route bestaat en rol-gate laat admin door (400 op lege body)");

  // — criterium 1: creditnota via de live route —
  const credRes = await fetch(`${APP_URL}/api/invoices/credit`, {
    method: "POST", headers,
    body: JSON.stringify({
      invoiceId: debit!.id,
      lineCredits: [{ lineId: dLine!.id, quantity: Number(dLine!.quantity) }],
      reason: "E2E-runtime-bewijs ticket 006",
    }),
  });
  const credJson = await credRes.json();
  if (credRes.status !== 200) fail(`credit-route: ${credRes.status} ${JSON.stringify(credJson)}`);
  const { data: credRow } = await admin.from("invoices").select("*").eq("id", credJson.creditInvoiceId).single();
  if (!credRow || credRow.credited_invoice_id !== debit!.id || credRow.total_cents !== -3630)
    fail(`creditrij klopt niet: ${JSON.stringify(credRow)}`);
  ok(`Creditnota ${credJson.invoiceNumber} live aangemaakt: total ${credRow.total_cents} (=-3630), gekoppeld aan origineel`);

  // — criterium 3: credit-PDF mailen via Graph + sent_at —
  const mailRes = await fetch(`${APP_URL}/api/invoices/email`, {
    method: "POST", headers, body: JSON.stringify({ invoiceId: credJson.creditInvoiceId }),
  });
  const mailJson = await mailRes.json();
  if (mailRes.status !== 200) fail(`credit-mail: ${mailRes.status} ${JSON.stringify(mailJson)}`);
  const { data: credAfter } = await admin.from("invoices").select("sent_at").eq("id", credJson.creditInvoiceId).single();
  if (!credAfter?.sent_at) fail("sent_at niet gezet op creditnota");
  ok(`Creditnota gemaild naar ${mailJson.to} (Graph 200), sent_at=${credAfter!.sent_at}`);

  // — criterium 5: regressie bestaande flow (order zonder credit) —
  const createRes = await fetch(`${APP_URL}/api/invoices/create`, {
    method: "POST", headers, body: JSON.stringify({ orderId: orderRegressie, clientId: client!.id, btwPct: 21 }),
  });
  const createJson = await createRes.json();
  if (createRes.status !== 200) fail(`create-route: ${createRes.status} ${JSON.stringify(createJson)}`);
  const newInvId = createJson.invoice.id as string;
  const { count: snapCount } = await admin.from("invoice_lines").select("*", { count: "exact", head: true }).eq("invoice_id", newInvId);
  const mail2Res = await fetch(`${APP_URL}/api/invoices/email`, {
    method: "POST", headers, body: JSON.stringify({ invoiceId: newInvId }),
  });
  if (mail2Res.status !== 200) fail(`regressie-mail: ${mail2Res.status} ${JSON.stringify(await mail2Res.json())}`);
  const { data: newInvAfter } = await admin.from("invoices").select("invoice_number, sent_at, total_cents").eq("id", newInvId).single();
  ok(`Regressie OK: factuur ${newInvAfter!.invoice_number} aangemaakt (total ${newInvAfter!.total_cents}, ${snapCount} snapshot-regel(s)), gemaild, sent_at=${newInvAfter!.sent_at}`);

  console.log("\n— BEWIJS COMPLEET —\n" + results.join("\n"));
} finally {
  await cleanup();
  const { data: check } = await admin.from("invoices").select("invoice_number").like("invoice_number", "STL-TEST-%");
  const { data: maxRow } = await admin.from("invoices").select("invoice_number").like("invoice_number", "STL-2026-%").order("invoice_number", { ascending: false }).limit(1);
  console.log(`\nOpruiming: ${check?.length ?? 0} testfacturen over; hoogste echte STL: ${maxRow?.[0]?.invoice_number}`);
}
