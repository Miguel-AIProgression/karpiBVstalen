// Livetests voor POST /api/invoices/credit (wayfinder-ticket 006) — rol-gate + RPC-doorgeleiding.
// Draait tegen de live DB (zie vitest.live.config.ts), NIET meegenomen in `npm test`.
// De migratie 20260712_credit_invoices.sql is bij het schrijven van dit bestand nog
// NIET live toegepast — dus dit bestand draait pas zodra de orchestrator die migratie
// heeft toegepast. Schrijven volstaat nu; draaien is voor later (`npm run test:live`).
//
// Testdata-conventie (spiegelt src/lib/create-credit-invoice.livetest.ts):
// client_number 99999, factuurnummer-prefix "STL-TEST-006-", orders met
// `delivery_date` NOT NULL. Extra hier: twee tijdelijke auth-testgebruikers
// (rolloos + admin), aangemaakt via admin.auth.admin.createUser en weer
// verwijderd in afterAll.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { POST } from "./route";

const TEST_CLIENT_NUMBER = 99999;
const TEST_INVOICE_PREFIX = "STL-TEST-006-";
const ROLELESS_EMAIL = "ticket006-roleless@test.local";
const ADMIN_EMAIL = "ticket006-admin@test.local";

let admin: SupabaseClient;
let clientId: string;
let invoiceSeq = 0;
let rolelessToken: string;
let rolelessUserId: string;
let adminToken: string;
let adminUserId: string;

async function cleanupData(db: SupabaseClient) {
  const { data: clients } = await db.from("clients").select("id").eq("client_number", TEST_CLIENT_NUMBER);
  for (const c of clients ?? []) {
    const { data: invoices } = await db.from("invoices").select("id, credited_invoice_id").eq("client_id", c.id);
    // credits eerst (FK RESTRICT op credited_invoice_id), dan debet
    for (const inv of (invoices ?? []).filter((i) => i.credited_invoice_id)) {
      await db.from("invoices").delete().eq("id", inv.id);
    }
    for (const inv of (invoices ?? []).filter((i) => !i.credited_invoice_id)) {
      await db.from("invoices").delete().eq("id", inv.id);
    }
    await db.from("orders").delete().eq("client_id", c.id);
    await db.from("clients").delete().eq("id", c.id);
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

/** Testorder + debetfactuur (fake nummer) + regel-snapshot; geeft ids + regels terug. */
async function makeDebitInvoice(opts?: {
  btwPct?: number;
  lines?: { description: string; quantity: number; amountCents: number }[];
}) {
  const btwPct = opts?.btwPct ?? 21;
  const lines = opts?.lines ?? [
    { description: "Collectie: Testcollectie", quantity: 1, amountCents: 5000 },
    { description: "Sample: Testkwaliteit-01", quantity: 2, amountCents: 1000 },
  ];
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({ client_id: clientId, status: "completed", delivery_date: "2026-07-12" })
    .select("id")
    .single();
  if (orderErr) throw orderErr;

  const subtotal = lines.reduce((s, l) => s + l.amountCents, 0);
  const btw = Math.round((subtotal * btwPct) / 100);
  invoiceSeq += 1;
  const { data: invoice, error: invErr } = await admin
    .from("invoices")
    .insert({
      invoice_number: `${TEST_INVOICE_PREFIX}${String(invoiceSeq).padStart(3, "0")}`,
      order_id: order.id,
      client_id: clientId,
      btw_pct: btwPct,
      subtotal_cents: subtotal,
      btw_cents: btw,
      total_cents: subtotal + btw,
    })
    .select("id, subtotal_cents, btw_cents, total_cents")
    .single();
  if (invErr) throw invErr;

  const { data: snapLines, error: lineErr } = await admin
    .from("invoice_lines")
    .insert(
      lines.map((l, i) => ({
        invoice_id: invoice.id,
        description: l.description,
        quantity: l.quantity,
        unit_price_cents: Math.round(l.amountCents / l.quantity),
        amount_cents: l.amountCents,
        position: i + 1,
      }))
    )
    .select("id, description, quantity, amount_cents");
  if (lineErr) throw lineErr;

  return { invoice, lines: snapLines! };
}

/** Roept de POST-handler direct aan (geen echte HTTP-server, geen middleware). */
async function postCredit(token: string | null, body: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const req = new NextRequest(
    new Request("http://localhost/api/invoices/credit", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
  );
  const res = await POST(req);
  const json = await res.json();
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
    .insert({ name: "TESTKLANT ticket-006-route (auto-verwijderd)", client_number: TEST_CLIENT_NUMBER, client_type: "wholesaler" })
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

describe("POST /api/invoices/credit — rol-gate", () => {
  it("zonder Authorization-header → 401", async () => {
    const { status, json } = await postCredit(null, { invoiceId: "00000000-0000-0000-0000-000000000000" });
    expect(status).toBe(401);
    expect(json).toEqual({ error: "Niet ingelogd" });
  });

  it("met Bearer-token van een rol-loze gebruiker → 403", async () => {
    const { status, json } = await postCredit(rolelessToken, { invoiceId: "00000000-0000-0000-0000-000000000000" });
    expect(status).toBe(403);
    expect(json).toEqual({ error: "Geen toestemming voor deze actie" });
  });
});

describe("POST /api/invoices/credit — happy path (admin, volledige credit via regels)", () => {
  it("geeft 200 met creditInvoiceId + invoiceNumber", async () => {
    const { invoice, lines } = await makeDebitInvoice();

    const { status, json } = await postCredit(adminToken, {
      invoiceId: invoice.id,
      lineCredits: lines.map((l) => ({ lineId: l.id, quantity: l.quantity })),
      reason: "Livetest route — volledige credit",
    });

    expect(status).toBe(200);
    expect(json.creditInvoiceId).toBeTruthy();
    expect(typeof json.invoiceNumber).toBe("string");

    const { data: credit } = await admin.from("invoices").select("*").eq("id", json.creditInvoiceId).single();
    expect(credit!.credited_invoice_id).toBe(invoice.id);
    expect(credit!.total_cents).toBe(-invoice.total_cents);
  });
});

describe("POST /api/invoices/credit — validatie", () => {
  it("beide creditmodi tegelijk → 400", async () => {
    const { invoice, lines } = await makeDebitInvoice();

    const { status, json } = await postCredit(adminToken, {
      invoiceId: invoice.id,
      lineCredits: [{ lineId: lines[0].id, quantity: 1 }],
      freeAmountCents: 100,
      freeDescription: "mag niet samen",
    });

    expect(status).toBe(400);
    expect(json.error).toBe("Kies precies één creditmodus: regels of vrij bedrag.");
  });

  it("ontbrekende invoiceId → 400", async () => {
    const { status, json } = await postCredit(adminToken, { lineCredits: [{ lineId: "x", quantity: 1 }] });
    expect(status).toBe(400);
    expect(json.error).toBe("invoiceId is verplicht");
  });

  it("credit boven het resterende factuurbedrag → 422 met Nederlandse melding", async () => {
    const { invoice, lines } = await makeDebitInvoice();

    // eerst volledig crediteren...
    const full = await postCredit(adminToken, {
      invoiceId: invoice.id,
      lineCredits: lines.map((l) => ({ lineId: l.id, quantity: l.quantity })),
    });
    expect(full.status).toBe(200);

    // ...dan nog een keer proberen: er resteert niets meer
    const { status, json } = await postCredit(adminToken, {
      invoiceId: invoice.id,
      freeAmountCents: 100,
      freeDescription: "overschrijding",
    });

    expect(status).toBe(422);
    expect(json.error).toMatch(/^Creditbedrag overschrijdt het resterende factuurbedrag/);
  });
});
