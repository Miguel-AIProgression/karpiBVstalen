// Livetests voor DELETE /api/invoices/[id] (wayfinder-ticket 007) — rol-gate +
// verwijder-guards + retrofit-bewijs op de create-route.
// Draait tegen de live DB (zie vitest.live.config.ts), NIET meegenomen in `npm test`.
// Vereist dat de DB-kant al live is: invoices.credited_invoice_id, de BEFORE
// DELETE-trigger `invoices_no_delete_when_sent` en de FK-RESTRICT op
// credited_invoice_id (zie migratiegeschiedenis rond 20260712_credit_invoices.sql).
//
// Testdata-conventie (spiegelt src/app/api/invoices/credit/route.livetest.ts):
// client_number 99999, factuurnummer-prefix "STL-TEST-007-", orders met
// `delivery_date` NOT NULL. Twee tijdelijke auth-testgebruikers (rolloos + admin).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { DELETE } from "./route";
import { POST as createInvoice } from "../create/route";

const TEST_CLIENT_NUMBER = 99999;
const TEST_INVOICE_PREFIX = "STL-TEST-007-";
const ROLELESS_EMAIL = "ticket007-roleless@test.local";
const ADMIN_EMAIL = "ticket007-admin@test.local";

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
    const { data: invoices, error: invoicesErr } = await db
      .from("invoices")
      .select("id, credited_invoice_id")
      .eq("client_id", c.id);
    if (invoicesErr) throw invoicesErr;

    // De delete-guard-testfactuur (sent_at gezet, zie guards-describe) blokkeert
    // anders zichzelf uit deze cleanup — eerst resetten, dan pas verwijderen.
    const invoiceIds = (invoices ?? []).map((i) => i.id);
    if (invoiceIds.length > 0) {
      const { error: resetErr } = await db.from("invoices").update({ sent_at: null }).in("id", invoiceIds);
      if (resetErr) throw resetErr;
    }

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

/** Testorder + debetfactuur (fake nummer) + regel-snapshot; geeft de factuur terug. */
async function makeDebitInvoice(opts?: { sentAt?: string | null }) {
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({ client_id: clientId, status: "completed", delivery_date: "2026-07-12" })
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
      sent_at: opts?.sentAt ?? null,
    })
    .select("id, invoice_number, sent_at, total_cents, order_id")
    .single();
  if (invErr) throw invErr;

  return invoice;
}

/** Roept de DELETE-handler direct aan (geen echte HTTP-server, geen middleware). */
async function deleteInvoice(token: string | null, id: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const req = new NextRequest(new Request(`http://localhost/api/invoices/${id}`, { method: "DELETE", headers }));
  const res = await DELETE(req, { params: Promise.resolve({ id }) });
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
    .insert({ name: "TESTKLANT ticket-007-route (auto-verwijderd)", client_number: TEST_CLIENT_NUMBER, client_type: "wholesaler" })
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

describe("DELETE /api/invoices/[id] — rol-gate", () => {
  it("zonder Authorization-header → 401", async () => {
    const { status, json } = await deleteInvoice(null, "00000000-0000-0000-0000-000000000000");
    expect(status).toBe(401);
    expect(json).toEqual({ error: "Niet ingelogd" });
  });

  it("met Bearer-token van een rol-loze gebruiker → 403", async () => {
    const { status, json } = await deleteInvoice(rolelessToken, "00000000-0000-0000-0000-000000000000");
    expect(status).toBe(403);
    expect(json).toEqual({ error: "Geen toestemming voor deze actie" });
  });
});

describe("DELETE /api/invoices/[id] — happy path (admin, niet-gemailde factuur)", () => {
  it("geeft 200 en de rij is daadwerkelijk weg", async () => {
    const invoice = await makeDebitInvoice();

    const { status, json } = await deleteInvoice(adminToken, invoice.id);
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true });

    const { data: gone } = await admin.from("invoices").select("id").eq("id", invoice.id).maybeSingle();
    expect(gone).toBeNull();
  });
});

describe("DELETE /api/invoices/[id] — guards", () => {
  it("gemailde factuur → 409 met 'crediteer'-melding", async () => {
    const invoice = await makeDebitInvoice({ sentAt: "2026-07-01T10:00:00Z" });

    const { status, json } = await deleteInvoice(adminToken, invoice.id);
    expect(status).toBe(409);
    expect(json.error).toContain("crediteer");

    const { data: stillThere } = await admin.from("invoices").select("id").eq("id", invoice.id).maybeSingle();
    expect(stillThere).not.toBeNull();
  });

  it("factuur met gekoppelde creditnota → 409 (ook als sentAt zelf null is, toetst de creditnota-guard los van de sentAt-guard)", async () => {
    const invoice = await makeDebitInvoice({ sentAt: null });
    invoiceSeq += 1;
    const { error: creditErr } = await admin.from("invoices").insert({
      invoice_number: `${TEST_INVOICE_PREFIX}${String(invoiceSeq).padStart(3, "0")}-CREDIT`,
      order_id: invoice.order_id,
      client_id: clientId,
      btw_pct: 21,
      subtotal_cents: -5000,
      btw_cents: -1050,
      total_cents: -6050,
      credited_invoice_id: invoice.id,
    });
    expect(creditErr).toBeNull();

    const { status, json } = await deleteInvoice(adminToken, invoice.id);
    expect(status).toBe(409);
    expect(json.error).toBeTruthy();
  });

  it("onbekende id → 404", async () => {
    const { status, json } = await deleteInvoice(adminToken, "00000000-0000-0000-0000-000000000000");
    expect(status).toBe(404);
    expect(json.error).toBe("Factuur niet gevonden");
  });
});

describe("POST /api/invoices/create — retrofit-bewijs rol-gate", () => {
  it("zonder Authorization-header → 401", async () => {
    const req = new NextRequest(
      new Request("http://localhost/api/invoices/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "00000000-0000-0000-0000-000000000000", clientId }),
      })
    );
    const res = await createInvoice(req);
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Niet ingelogd" });
  });
});
