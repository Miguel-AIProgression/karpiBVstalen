// Livetests voor POST /api/invoices/[id]/supersede (ICL/vervang-flow,
// migratie 20260713_icl_en_herfactureren.sql — RPC supersede_invoice).
// Draait tegen de live DB (zie vitest.live.config.ts), NIET meegenomen in `npm test`.
// De migratie is bij het schrijven van dit bestand nog NIET live toegepast — dus
// dit bestand draait pas zodra de orchestrator die migratie heeft toegepast.
// Schrijven volstaat nu; draaien is voor later (`npm run test:live`).
//
// Testdata-conventie (spiegelt src/app/api/invoices/[id]/route.livetest.ts):
// client_number 99999, factuurnummer-prefix "STL-TEST-SUPERSEDE-", orders met
// `delivery_date` NOT NULL. Twee tijdelijke auth-testgebruikers (rolloos + admin).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { POST as supersedeInvoice } from "./supersede/route";
import { POST as createInvoice } from "../create/route";

const TEST_CLIENT_NUMBER = 99999;
const TEST_INVOICE_PREFIX = "STL-TEST-SUPERSEDE-";
const ROLELESS_EMAIL = "supersede-roleless@test.local";
const ADMIN_EMAIL = "supersede-admin@test.local";

let admin: SupabaseClient;
let clientId: string;
let invoiceSeq = 0;
let rolelessToken: string;
let rolelessUserId: string;
let adminToken: string;
let adminUserId: string;

async function cleanupData(db: SupabaseClient) {
  const { data: clients, error: clientsErr } = await db
    .from("clients")
    .select("id")
    .eq("client_number", TEST_CLIENT_NUMBER);
  if (clientsErr) throw clientsErr;

  for (const c of clients ?? []) {
    // sent_at eerst los: de delete-trigger blokkeert gemailde facturen, ook voor service-role
    const { error: resetErr } = await db.from("invoices").update({ sent_at: null }).eq("client_id", c.id);
    if (resetErr) throw resetErr;

    const { data: invoices, error: invoicesErr } = await db
      .from("invoices")
      .select("id, credited_invoice_id")
      .eq("client_id", c.id);
    if (invoicesErr) throw invoicesErr;

    // credits eerst (FK RESTRICT op credited_invoice_id), dan debet
    for (const inv of (invoices ?? []).filter((i) => i.credited_invoice_id)) {
      const { error: delErr } = await db.from("invoices").delete().eq("id", inv.id);
      if (delErr) throw delErr;
    }
    for (const inv of (invoices ?? []).filter((i) => !i.credited_invoice_id)) {
      const { error: delErr } = await db.from("invoices").delete().eq("id", inv.id);
      if (delErr) throw delErr;
    }

    const { error: ordersErr } = await db.from("orders").delete().eq("client_id", c.id);
    if (ordersErr) throw ordersErr;

    const { error: clientErr } = await db.from("clients").delete().eq("id", c.id);
    if (clientErr) throw clientErr;
  }
}

async function cleanupUser(db: SupabaseClient, email: string) {
  const { data } = await db.auth.admin.listUsers();
  const existing = data?.users.find((u) => u.email === email);
  if (existing) await db.auth.admin.deleteUser(existing.id);
}

/** Maakt een tijdelijke auth-gebruiker + geeft een echte JWT terug via signInWithPassword. */
async function createTestUser(opts: { email: string; role?: "sales" | "admin" | "production" }) {
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email,
    password,
    email_confirm: true,
    app_metadata: opts.role ? { role: opts.role } : undefined,
  });
  if (error) throw error;

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email: opts.email, password });
  if (signInErr) throw signInErr;

  return { userId: data.user!.id, token: signIn.session!.access_token };
}

/** Testorder + gemailde debetfactuur (fake nummer, subtotaal 5000/btw 1050/totaal 6050); geeft de rij terug. */
async function makeDebitInvoice() {
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({ client_id: clientId, status: "completed", delivery_date: "2026-07-13" })
    .select("id")
    .single();
  if (orderErr) throw orderErr;

  invoiceSeq += 1;
  const { data: invoice, error: invErr } = await admin
    .from("invoices")
    .insert({
      invoice_number: `${TEST_INVOICE_PREFIX}${String(invoiceSeq).padStart(3, "0")}`,
      order_id: order.id,
      client_id: clientId,
      btw_pct: 21,
      subtotal_cents: 5000,
      btw_cents: 1050,
      total_cents: 6050,
      sent_at: "2026-07-13T10:00:00Z",
    })
    .select("id, invoice_number, sent_at, total_cents, order_id")
    .single();
  if (invErr) throw invErr;

  return invoice;
}

/** Boekt een creditnota op `invoice` voor `amountCents` excl. btw (21%, teken wordt hier gezet). */
async function makeCreditNote(invoice: { id: string; order_id: string }, amountCents: number) {
  invoiceSeq += 1;
  const btw = Math.round((amountCents * 21) / 100);
  const { data: credit, error } = await admin
    .from("invoices")
    .insert({
      invoice_number: `${TEST_INVOICE_PREFIX}${String(invoiceSeq).padStart(3, "0")}-CREDIT`,
      order_id: invoice.order_id,
      client_id: clientId,
      btw_pct: 21,
      subtotal_cents: -amountCents,
      btw_cents: -btw,
      total_cents: -(amountCents + btw),
      credited_invoice_id: invoice.id,
    })
    .select("id, total_cents")
    .single();
  if (error) throw error;
  return credit;
}

/** Roept de POST-handler (supersede) direct aan (geen echte HTTP-server, geen middleware). */
async function postSupersede(token: string | null, id: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const req = new NextRequest(
    new Request(`http://localhost/api/invoices/${id}/supersede`, { method: "POST", headers })
  );
  const res = await supersedeInvoice(req, { params: Promise.resolve({ id }) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/** Roept de POST-handler (create) direct aan. */
async function postCreate(token: string | null, body: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const req = new NextRequest(
    new Request("http://localhost/api/invoices/create", { method: "POST", headers, body: JSON.stringify(body) })
  );
  const res = await createInvoice(req);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ontbreken");
  admin = createClient(url, key);

  await cleanupData(admin); // restanten van eerdere (gecrashte) runs
  await cleanupUser(admin, ROLELESS_EMAIL);
  await cleanupUser(admin, ADMIN_EMAIL);

  const { data, error } = await admin
    .from("clients")
    .insert({ name: "TESTKLANT supersede-route (auto-verwijderd)", client_number: TEST_CLIENT_NUMBER, client_type: "wholesaler" })
    .select("id")
    .single();
  if (error) throw error;
  clientId = data.id;

  const roleless = await createTestUser({ email: ROLELESS_EMAIL });
  rolelessToken = roleless.token;
  rolelessUserId = roleless.userId;

  const adminUser = await createTestUser({ email: ADMIN_EMAIL, role: "admin" });
  adminToken = adminUser.token;
  adminUserId = adminUser.userId;
});

afterAll(async () => {
  await cleanupData(admin);
  if (rolelessUserId) await admin.auth.admin.deleteUser(rolelessUserId);
  if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
});

describe("POST /api/invoices/[id]/supersede — rol-gate", () => {
  it("zonder Authorization-header → 401", async () => {
    const { status, json } = await postSupersede(null, "00000000-0000-0000-0000-000000000000");
    expect(status).toBe(401);
    expect(json).toEqual({ error: "Niet ingelogd" });
  });

  it("met Bearer-token van een rol-loze gebruiker → 403", async () => {
    const { status, json } = await postSupersede(rolelessToken, "00000000-0000-0000-0000-000000000000");
    expect(status).toBe(403);
    expect(json).toEqual({ error: "Geen toestemming voor deze actie" });
  });
});

describe("POST /api/invoices/[id]/supersede — guard: niet volledig gecrediteerd", () => {
  it("factuur met slechts een deelcredit → 409 'niet volledig gecrediteerd'", async () => {
    const invoice = await makeDebitInvoice();
    await makeCreditNote(invoice, 1000); // deelcredit — er resteert nog €4.840 + btw

    const { status, json } = await postSupersede(adminToken, invoice.id);
    expect(status).toBe(409);
    expect(json.error).toContain("niet volledig gecrediteerd");

    const { data: stillActive } = await admin.from("invoices").select("superseded_at").eq("id", invoice.id).single();
    expect(stillActive!.superseded_at).toBeNull();
  });
});

describe("POST /api/invoices/[id]/supersede — happy path (volledig gecrediteerd)", () => {
  it("200 + superseded_at gezet; daarna staat een NIEUWE debetfactuur op dezelfde order toe en de idempotentie-check in create pakt de nieuwe (niet de oude)", async () => {
    const invoice = await makeDebitInvoice();
    await makeCreditNote(invoice, 5000); // volledige credit: subtotaal 5000/btw 1050 → total -6050, spiegelt de debetfactuur exact

    const { status, json } = await postSupersede(adminToken, invoice.id);
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true });

    const { data: superseded } = await admin.from("invoices").select("superseded_at").eq("id", invoice.id).single();
    expect(superseded!.superseded_at).not.toBeNull();

    // Bewijs dat de partial UNIQUE (WHERE credited_invoice_id IS NULL AND
    // superseded_at IS NULL) nu een nieuwe debetfactuur op dezelfde order toestaat
    // — vóór deze migratie zou dit op de unieke index botsen.
    const created = await postCreate(adminToken, { orderId: invoice.order_id, clientId, btwPct: 21 });
    expect(created.status).toBe(200);
    expect(created.json.invoice.id).not.toBe(invoice.id);

    // Idempotentie: create nogmaals aanroepen vindt de NIEUWE factuur (superseded_at
    // IS NULL), niet de vervangen oude — bewijst dat de .is("superseded_at", null)-
    // filter in create/route.ts de vervangen factuur negeert.
    const createdAgain = await postCreate(adminToken, { orderId: invoice.order_id, clientId, btwPct: 21 });
    expect(createdAgain.status).toBe(200);
    expect(createdAgain.json.invoice.id).toBe(created.json.invoice.id);
  });
});

describe("POST /api/invoices/[id]/supersede — guards: creditnota en dubbel vervangen", () => {
  it("een creditnota zelf proberen te vervangen → 409", async () => {
    const invoice = await makeDebitInvoice();
    const credit = await makeCreditNote(invoice, 5000);

    const { status, json } = await postSupersede(adminToken, credit.id);
    expect(status).toBe(409);
    expect(json.error).toBeTruthy();
  });

  it("een al vervangen factuur nogmaals vervangen → 409 'al vervangen'", async () => {
    const invoice = await makeDebitInvoice();
    await makeCreditNote(invoice, 5000);

    const first = await postSupersede(adminToken, invoice.id);
    expect(first.status).toBe(200);

    const { status, json } = await postSupersede(adminToken, invoice.id);
    expect(status).toBe(409);
    expect(json.error).toContain("al vervangen");
  });
});
