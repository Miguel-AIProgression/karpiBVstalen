// Livetests voor POST /api/invoices/csv (AFAS-XLSX-ticket 17-07: creditnota's
// mee in de download + buiten-EU-tegenrekening 8019/btw-code 33; 17-07 omgezet
// van CSV naar een écht .xlsx-bestand — zie afas-xlsx.ts).
// Draait tegen de live DB (zie vitest.live.config.ts), NIET meegenomen in `npm test`.
//
// Testdata-conventie (spiegelt src/app/api/invoices/credit/route.livetest.ts):
// client_number 99999, factuurnummer-prefix "STL-TEST-CSV-", orders met
// `delivery_date` NOT NULL. Twee tijdelijke auth-testgebruikers (rolloos + admin).
//
// De happy-path-debetfactuur krijgt bewust een ECHTE STL-YYYY-NNN-nummer via
// next_invoice_number() (i.p.v. het TEST_INVOICE_PREFIX-fake-nummer dat de
// andere scenario's gebruiken) — anders zou de credit (die altijd een echt
// nummer krijgt via create_credit_invoice) niet betrouwbaar ná de debetfactuur
// sorteren (fake- en echte reeksen lopen niet gelijk op). Dit spiegelt hoe de
// productieroute facturen nummert; het verbruikt een echte reeksplek die de
// teardown weer vrijgeeft (zie create-credit-invoice.livetest.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { POST } from "./route";

const TEST_CLIENT_NUMBER = 99999;
const TEST_INVOICE_PREFIX = "STL-TEST-CSV-";
const ROLELESS_EMAIL = "ticketcsv-roleless@test.local";
const ADMIN_EMAIL = "ticketcsv-admin@test.local";

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
    // sent_at eerst los, anders blokkeert de delete-trigger residu van eerdere runs
    await db.from("invoices").update({ sent_at: null }).eq("client_id", c.id);
    const { data: invoices } = await db.from("invoices").select("id, credited_invoice_id").eq("client_id", c.id);
    // credits eerst (FK RESTRICT op credited_invoice_id), dan debet
    for (const inv of (invoices ?? []).filter((i) => i.credited_invoice_id)) {
      await db.from("invoices").delete().eq("id", inv.id);
    }
    for (const inv of (invoices ?? []).filter((i) => !i.credited_invoice_id)) {
      await db.from("invoices").delete().eq("id", inv.id);
    }
    await db.from("client_addresses").delete().eq("client_id", c.id);
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

/** Testorder + debetfactuur + regel-snapshot. `useRealNumber` = via next_invoice_number() i.p.v. het testprefix. */
async function makeDebitInvoice(opts?: {
  btwPct?: number;
  lines?: { description: string; quantity: number; amountCents: number }[];
  useRealNumber?: boolean;
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

  let invoiceNumber: string;
  if (opts?.useRealNumber) {
    const { data: numRow, error: numErr } = await admin.rpc("next_invoice_number" as never);
    if (numErr) throw numErr;
    invoiceNumber = numRow as unknown as string;
  } else {
    invoiceSeq += 1;
    invoiceNumber = `${TEST_INVOICE_PREFIX}${String(invoiceSeq).padStart(3, "0")}`;
  }

  const { data: invoice, error: invErr } = await admin
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      order_id: order.id,
      client_id: clientId,
      btw_pct: btwPct,
      subtotal_cents: subtotal,
      btw_cents: btw,
      total_cents: subtotal + btw,
    })
    .select("id, invoice_number, subtotal_cents, btw_cents, total_cents")
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

async function createCredit(params: {
  invoiceId: string;
  lineCredits?: { invoice_line_id: string; quantity: number }[];
  freeAmountCents?: number;
  freeAmountInclBtw?: boolean;
  freeDescription?: string;
  reason?: string;
}) {
  return admin.rpc("create_credit_invoice" as never, {
    p_invoice_id: params.invoiceId,
    p_line_credits: params.lineCredits ?? null,
    p_free_amount_cents: params.freeAmountCents ?? null,
    p_free_amount_incl_btw: params.freeAmountInclBtw ?? false,
    p_free_description: params.freeDescription ?? null,
    p_reason: params.reason ?? null,
  } as never);
}

/** Vervangt (upsert) de primaire client_addresses-rij van de testklant met een gegeven land. */
async function setPrimaryAddressCountry(country: string) {
  await admin.from("client_addresses").delete().eq("client_id", clientId).eq("is_primary", true);
  const { error } = await admin.from("client_addresses").insert({
    client_id: clientId,
    is_primary: true,
    label: "Test",
    country,
  });
  if (error) throw error;
}

/** Roept de POST-handler direct aan (geen echte HTTP-server, geen middleware). */
async function postCsv(token: string | null, body: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const req = new NextRequest(
    new Request("http://localhost/api/invoices/csv", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
  );
  return POST(req);
}

/** Voor de foutpaden (401/403/400): die blijven JSON (NextResponse.json), geen xlsx-bytes. */
async function postCsvError(token: string | null, body: unknown) {
  const res = await postCsv(token, body);
  const text = await res.text();
  return { status: res.status, text };
}

/**
 * Voor de 200-happy-paths: leest de geproduceerde .xlsx-bytes terug met
 * XLSX.read (zelfde contract als afas-xlsx.test.ts) en geeft de rijen als
 * array-of-arrays terug (rij 0 = header, cellDates:true → Datum/Verv.datum
 * zijn echte Date-objecten, geen strings meer).
 */
async function postCsvXlsx(token: string | null, body: unknown) {
  const res = await postCsv(token, body);
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true, cellNF: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  return { status: res.status, aoa };
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
    .insert({ name: "TESTKLANT ticket-csv-route (auto-verwijderd)", client_number: TEST_CLIENT_NUMBER, client_type: "wholesaler" })
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

describe("POST /api/invoices/csv — rol-gate", () => {
  it("zonder Authorization-header → 401", async () => {
    const { status, text } = await postCsvError(null, { invoiceIds: ["00000000-0000-0000-0000-000000000000"] });
    expect(status).toBe(401);
    expect(JSON.parse(text)).toEqual({ error: "Niet ingelogd" });
  });

  it("met Bearer-token van een rol-loze gebruiker → 403", async () => {
    const { status, text } = await postCsvError(rolelessToken, { invoiceIds: ["00000000-0000-0000-0000-000000000000"] });
    expect(status).toBe(403);
    expect(JSON.parse(text)).toEqual({ error: "Geen toestemming voor deze actie" });
  });
});

describe("POST /api/invoices/csv — validatie", () => {
  it("lege invoiceIds → 400", async () => {
    const { status, text } = await postCsvError(adminToken, { invoiceIds: [] });
    expect(status).toBe(400);
    expect(JSON.parse(text).error).toBeTruthy();
  });

  it("invoiceIds als string i.p.v. array → 400 (code review d93af97: !invoiceIds?.length accepteert ook een string)", async () => {
    const { status, text } = await postCsvError(adminToken, {
      invoiceIds: "00000000-0000-0000-0000-000000000000",
    });
    expect(status).toBe(400);
    expect(JSON.parse(text).error).toBeTruthy();
  });
});

describe("POST /api/invoices/csv — happy path: debet + credit, sortering, negatieve bedragen", () => {
  it(".xlsx bevat 2 datarijen, debet vóór credit, creditrij negatief, Datum/Verv.datum echte Date-cellen", async () => {
    const { invoice, lines } = await makeDebitInvoice({ useRealNumber: true });

    const { data: creditId, error: creditErr } = await createCredit({
      invoiceId: invoice.id,
      lineCredits: lines.map((l) => ({ invoice_line_id: l.id, quantity: l.quantity })),
      reason: "Livetest AFAS-XLSX",
    });
    expect(creditErr).toBeNull();

    const { data: creditRow } = await admin
      .from("invoices")
      .select("invoice_number")
      .eq("id", creditId as string)
      .single();

    // invoiceIds bewust in omgekeerde volgorde aangeleverd — de route/buildAfasXlsx
    // moet zelf op factuurnummer sorteren.
    const { status, aoa } = await postCsvXlsx(adminToken, {
      invoiceIds: [creditId as string, invoice.id],
    });
    expect(status).toBe(200);

    const dataRows = aoa.slice(1); // header eraf
    expect(dataRows).toHaveLength(2);

    const debitRow = dataRows[0];
    const creditRow2 = dataRows[1];

    // Factuurnr = index 9, Datum = 10, Verv.datum = 11, Bedrag ex = 12, BTW bedrag = 13, Totaal = 14
    expect(debitRow[9]).toBe(invoice.invoice_number);
    expect(creditRow2[9]).toBe(creditRow!.invoice_number);

    expect(debitRow[10]).toBeInstanceOf(Date);
    expect(debitRow[11]).toBeInstanceOf(Date);
    expect(creditRow2[10]).toBeInstanceOf(Date);
    expect(creditRow2[11]).toBeInstanceOf(Date);

    expect(typeof creditRow2[12]).toBe("number");
    expect(creditRow2[12] as number).toBeLessThan(0); // Bedrag ex negatief
    expect(creditRow2[13] as number).toBeLessThan(0); // BTW bedrag negatief
    expect(creditRow2[14] as number).toBeLessThan(0); // Totaal negatief
  });
});

describe("POST /api/invoices/csv — vervangen factuur blijft buiten de .xlsx", () => {
  it("een superseded_at-factuur in de selectie levert geen datarij op", async () => {
    const { invoice } = await makeDebitInvoice();
    const { error: supersedeErr } = await admin
      .from("invoices")
      .update({ superseded_at: new Date().toISOString() })
      .eq("id", invoice.id);
    expect(supersedeErr).toBeNull();

    const { status, aoa } = await postCsvXlsx(adminToken, { invoiceIds: [invoice.id] });
    expect(status).toBe(200);

    expect(aoa).toHaveLength(1); // alleen de header
    expect(aoa[0]).not.toContain(invoice.invoice_number);
  });
});

describe("POST /api/invoices/csv — buiten-EU-tegenrekening 8019/33", () => {
  it("0%-factuur naar Zwitserland boekt op 8019/33", async () => {
    await setPrimaryAddressCountry("Zwitserland");
    const { invoice } = await makeDebitInvoice({ btwPct: 0 });

    const { status, aoa } = await postCsvXlsx(adminToken, { invoiceIds: [invoice.id] });
    expect(status).toBe(200);

    const dataRow = aoa[1];
    expect(dataRow[6]).toBe("Zwitserland"); // Land
    expect(dataRow[15]).toBe("8019"); // Tegenrekening
    expect(dataRow[16]).toBe("33"); // BTW
  });

  it("0%-factuur naar België blijft op 8018/34 (ICL, geen buiten-EU-boeking)", async () => {
    await setPrimaryAddressCountry("België");
    const { invoice } = await makeDebitInvoice({ btwPct: 0 });

    const { status, aoa } = await postCsvXlsx(adminToken, { invoiceIds: [invoice.id] });
    expect(status).toBe(200);

    const dataRow = aoa[1];
    expect(dataRow[6]).toBe("België"); // Land
    expect(dataRow[15]).toBe("8018"); // Tegenrekening
    expect(dataRow[16]).toBe("34"); // BTW
  });
});

describe("POST /api/invoices/csv — onbekend invoice-id", () => {
  it("een niet-bestaand id tussen de selectie wordt stil overgeslagen, geen error", async () => {
    const { invoice } = await makeDebitInvoice();

    const { status, aoa } = await postCsvXlsx(adminToken, {
      invoiceIds: [invoice.id, "00000000-0000-0000-0000-000000000000"],
    });
    expect(status).toBe(200);

    const dataRows = aoa.slice(1);
    expect(dataRows).toHaveLength(1);
    expect(dataRows[0]).toContain(invoice.invoice_number);
  });
});

describe("POST /api/invoices/csv — batching bij grote selecties (hardening code review d93af97)", () => {
  it("450 id's (kruist de 200-batchgrens 2x) → geen fout, alle 3 echte facturen komen terug — bewijst dat elke batch daadwerkelijk bevraagd wordt", async () => {
    // Live geverifieerd (17-07): één .in()-call met >~350 UUID's faalt hard
    // ("fetch failed" / lege foutmelding, vermoedelijk een URL-lengtelimiet bij
    // Supabase's gateway) — vandaar 450 id's hier, ruim over die grens.
    const inv1 = await makeDebitInvoice();
    const inv2 = await makeDebitInvoice();
    const inv3 = await makeDebitInvoice();

    const FAKE_ID_COUNT = 450;
    const invoiceIds: string[] = Array.from({ length: FAKE_ID_COUNT }, () => crypto.randomUUID());
    // Posities zo gekozen dat elk van de 3 (bij batchgrootte 200) batches een
    // echt factuur-id bevat: batch 1 (0-199), batch 2 (200-399), batch 3 (400-449).
    invoiceIds[0] = inv1.invoice.id;
    invoiceIds[220] = inv2.invoice.id;
    invoiceIds[440] = inv3.invoice.id;

    const { status, aoa } = await postCsvXlsx(adminToken, { invoiceIds });
    expect(status).toBe(200);

    const dataRows = aoa.slice(1);
    expect(dataRows).toHaveLength(3);
    const invoiceNumbers = dataRows.map((row) => row[9]);
    expect(invoiceNumbers.sort()).toEqual(
      [inv1.invoice.invoice_number, inv2.invoice.invoice_number, inv3.invoice.invoice_number].sort()
    );
  });
});
