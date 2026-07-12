// Livetests voor de RPC create_credit_invoice (wayfinder-ticket 006).
// Draait tegen de live DB met eigen testdata (client 99999 + fake STL-TEST-nummers
// voor debetrijen zodat next_invoice_number() er niets van merkt). De credit-RPC
// verbruikt wél echte STL-nummers; omdat de reeks MAX+1-gebaseerd is, herstelt
// het nummer zich zodra de teardown de testrijen verwijdert.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const TEST_CLIENT_NUMBER = 99999;
const TEST_INVOICE_PREFIX = "STL-TEST-006-";

let admin: SupabaseClient;
let clientId: string;
let invoiceSeq = 0;
const orderIds: string[] = [];

async function cleanup(db: SupabaseClient) {
  const { data: clients } = await db
    .from("clients")
    .select("id")
    .eq("client_number", TEST_CLIENT_NUMBER);
  for (const c of clients ?? []) {
    const { data: invoices } = await db
      .from("invoices")
      .select("id, credited_invoice_id")
      .eq("client_id", c.id);
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

/** Testorder + debetfactuur (fake nummer) + regel-snapshot; geeft ids terug. */
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
  orderIds.push(order.id);

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

async function createCredit(params: {
  invoiceId: string;
  lineCredits?: { invoice_line_id: string; quantity: number }[];
  freeAmountCents?: number;
  freeAmountInclBtw?: boolean;
  freeDescription?: string;
  reason?: string;
}) {
  return admin.rpc("create_credit_invoice", {
    p_invoice_id: params.invoiceId,
    p_line_credits: params.lineCredits ?? null,
    p_free_amount_cents: params.freeAmountCents ?? null,
    p_free_amount_incl_btw: params.freeAmountInclBtw ?? false,
    p_free_description: params.freeDescription ?? null,
    p_reason: params.reason ?? null,
  } as never);
}

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ontbreken");
  admin = createClient(url, key);
  await cleanup(admin); // restanten van eerdere (gecrashte) runs
  const { data, error } = await admin
    .from("clients")
    .insert({
      name: "TESTKLANT ticket-006 (auto-verwijderd)",
      client_number: TEST_CLIENT_NUMBER,
      client_type: "wholesaler",
    })
    .select("id")
    .single();
  if (error) throw error;
  clientId = data.id;
});

afterAll(async () => {
  await cleanup(admin);
});

describe("create_credit_invoice — guards en modi", () => {
  it("weigert een tweede credit boven het debettotaal (limiet + €0,01)", async () => {
    const { invoice, lines } = await makeDebitInvoice();
    const full = lines.map((l) => ({ invoice_line_id: l.id, quantity: l.quantity }));
    const first = await createCredit({ invoiceId: invoice.id, lineCredits: full });
    expect(first.error).toBeNull();

    const second = await createCredit({ invoiceId: invoice.id, freeAmountCents: 100, freeDescription: "Boven limiet" });
    expect(second.error).not.toBeNull();
    expect(second.error!.message).toContain("overschrijdt");
  });

  it("weigert een creditnota op een creditnota", async () => {
    const { invoice } = await makeDebitInvoice();
    const { data: creditId } = await createCredit({
      invoiceId: invoice.id, freeAmountCents: 500, freeDescription: "Eerste credit",
    });
    const onCredit = await createCredit({
      invoiceId: creditId as string, freeAmountCents: 100, freeDescription: "Credit op credit",
    });
    expect(onCredit.error).not.toBeNull();
    expect(onCredit.error!.message).toContain("originele factuur");
  });

  it("berekent deelcredit pro-rata op het regelbedrag", async () => {
    const { invoice, lines } = await makeDebitInvoice({
      lines: [{ description: "Sample: Deeltest", quantity: 3, amountCents: 1000 }],
    });
    const { data: creditId, error } = await createCredit({
      invoiceId: invoice.id,
      lineCredits: [{ invoice_line_id: lines[0].id, quantity: 1 }],
    });
    expect(error).toBeNull();
    const { data: credit } = await admin.from("invoices").select("subtotal_cents, btw_cents, total_cents").eq("id", creditId as string).single();
    expect(credit!.subtotal_cents).toBe(-333); // round(1000 * 1/3)
    expect(credit!.btw_cents).toBe(-70); // round(333 * 0.21)
    expect(credit!.total_cents).toBe(-403);
  });

  it("weigert een aantal boven het originele regelaantal", async () => {
    const { invoice, lines } = await makeDebitInvoice({
      lines: [{ description: "Sample: Maxtest", quantity: 2, amountCents: 1000 }],
    });
    const res = await createCredit({
      invoiceId: invoice.id,
      lineCredits: [{ invoice_line_id: lines[0].id, quantity: 3 }],
    });
    expect(res.error).not.toBeNull();
    expect(res.error!.message).toContain("maximaal");
  });

  it("vrij bedrag excl. BTW: subtotal exact, btw berekend", async () => {
    const { invoice } = await makeDebitInvoice();
    const { data: creditId, error } = await createCredit({
      invoiceId: invoice.id, freeAmountCents: 1000, freeDescription: "Coulance",
      reason: "Livetest vrij bedrag",
    });
    expect(error).toBeNull();
    const { data: credit } = await admin.from("invoices").select("subtotal_cents, btw_cents, total_cents, credit_reason").eq("id", creditId as string).single();
    expect(credit!.subtotal_cents).toBe(-1000);
    expect(credit!.btw_cents).toBe(-210);
    expect(credit!.total_cents).toBe(-1210);
    expect(credit!.credit_reason).toBe("Livetest vrij bedrag");
  });

  it("vrij bedrag incl. BTW: total exact, subtotal teruggerekend", async () => {
    const { invoice } = await makeDebitInvoice();
    const { data: creditId, error } = await createCredit({
      invoiceId: invoice.id, freeAmountCents: 10000, freeAmountInclBtw: true, freeDescription: "Coulance incl.",
    });
    expect(error).toBeNull();
    const { data: credit } = await admin.from("invoices").select("subtotal_cents, btw_cents, total_cents").eq("id", creditId as string).single();
    expect(credit!.total_cents).toBe(-10000);
    expect(credit!.subtotal_cents).toBe(-8264); // round(10000 / 1.21)
    expect(credit!.btw_cents).toBe(-1736);
  });

  it("weigert vrij bedrag zonder omschrijving", async () => {
    const { invoice } = await makeDebitInvoice();
    const res = await createCredit({ invoiceId: invoice.id, freeAmountCents: 500 });
    expect(res.error).not.toBeNull();
    expect(res.error!.message).toContain("omschrijving");
  });

  it("weigert beide modi tegelijk en geen modus", async () => {
    const { invoice, lines } = await makeDebitInvoice();
    const both = await createCredit({
      invoiceId: invoice.id,
      lineCredits: [{ invoice_line_id: lines[0].id, quantity: 1 }],
      freeAmountCents: 500, freeDescription: "x",
    });
    expect(both.error).not.toBeNull();
    const neither = await createCredit({ invoiceId: invoice.id });
    expect(neither.error).not.toBeNull();
  });

  it("weigert regels-modus als het origineel geen regel-snapshot heeft", async () => {
    const { invoice, lines } = await makeDebitInvoice();
    await admin.from("invoice_lines").delete().eq("invoice_id", invoice.id);
    const res = await createCredit({
      invoiceId: invoice.id,
      lineCredits: [{ invoice_line_id: lines[0].id, quantity: 1 }],
    });
    expect(res.error).not.toBeNull();
    expect(res.error!.message).toContain("regel-snapshot");
  });

  it("DB-vangnet: directe insert van een positieve creditrij faalt op de teken-CHECK", async () => {
    const { invoice } = await makeDebitInvoice();
    invoiceSeq += 1;
    const { error } = await admin.from("invoices").insert({
      invoice_number: `${TEST_INVOICE_PREFIX}${String(invoiceSeq).padStart(3, "0")}`,
      order_id: (await admin.from("invoices").select("order_id").eq("id", invoice.id).single()).data!.order_id,
      client_id: clientId,
      btw_pct: 21,
      subtotal_cents: 1000, btw_cents: 210, total_cents: 1210,
      credited_invoice_id: invoice.id,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("invoices_sign_matches_type");
  });

  it("partial UNIQUE: tweede debetfactuur op dezelfde order faalt, credit mag wel", async () => {
    const { invoice } = await makeDebitInvoice();
    const { data: orderRow } = await admin.from("invoices").select("order_id").eq("id", invoice.id).single();
    invoiceSeq += 1;
    const { error: dupErr } = await admin.from("invoices").insert({
      invoice_number: `${TEST_INVOICE_PREFIX}${String(invoiceSeq).padStart(3, "0")}`,
      order_id: orderRow!.order_id,
      client_id: clientId,
      btw_pct: 21,
      subtotal_cents: 100, btw_cents: 21, total_cents: 121,
    });
    expect(dupErr).not.toBeNull();
    expect(dupErr!.message).toContain("invoices_one_debit_per_order");

    const { error: creditErr } = await createCredit({
      invoiceId: invoice.id, freeAmountCents: 100, freeDescription: "Credit naast debet",
    });
    expect(creditErr).toBeNull();
  });

  it("RPC is niet aanroepbaar met de anon-key (REVOKE)", async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { invoice } = await makeDebitInvoice();
    const { error } = await anon.rpc("create_credit_invoice", {
      p_invoice_id: invoice.id,
      p_free_amount_cents: 100,
      p_free_description: "anon poging",
    } as never);
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toContain("permission denied");
  });
});

describe("create_credit_invoice — volledige credit via regels", () => {
  it("maakt een creditnota met exact gespiegelde negatieve bedragen en koppeling", async () => {
    const { invoice, lines } = await makeDebitInvoice();

    const { data: creditId, error } = await createCredit({
      invoiceId: invoice.id,
      lineCredits: lines.map((l) => ({ invoice_line_id: l.id, quantity: l.quantity })),
      reason: "Livetest volledige credit",
    });
    expect(error).toBeNull();
    expect(creditId).toBeTruthy();

    const { data: credit } = await admin
      .from("invoices")
      .select("*")
      .eq("id", creditId as string)
      .single();
    expect(credit!.credited_invoice_id).toBe(invoice.id);
    expect(credit!.subtotal_cents).toBe(-invoice.subtotal_cents);
    expect(credit!.btw_cents).toBe(-invoice.btw_cents);
    expect(credit!.total_cents).toBe(-invoice.total_cents);
    expect(credit!.invoice_number).toMatch(/^STL-\d{4}-\d{3,}$/);
    expect(credit!.sent_at).toBeNull();

    const { data: creditLines } = await admin
      .from("invoice_lines")
      .select("description, quantity, amount_cents")
      .eq("invoice_id", creditId as string)
      .order("position");
    expect(creditLines).toHaveLength(lines.length);
    for (const [i, cl] of creditLines!.entries()) {
      expect(cl.amount_cents).toBe(-lines[i].amount_cents);
      expect(Number(cl.quantity)).toBe(Number(lines[i].quantity));
    }
  });
});
