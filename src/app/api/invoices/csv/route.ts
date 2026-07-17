import { NextRequest, NextResponse } from "next/server";
import { loadInvoiceRenderData, type StoredInvoiceForRender } from "@/lib/invoice-snapshot";
import { buildAfasCsv, type AfasCsvRowInput } from "@/lib/afas-csv";
import { requireRole } from "@/lib/auth/require-role";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const auth = await requireRole(req, ["sales", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { invoiceIds } = (await req.json()) as { invoiceIds: string[] };

    if (!invoiceIds?.length) {
      return NextResponse.json({ error: "Geen facturen opgegeven" }, { status: 400 });
    }

    // Debet- én creditfacturen mogen mee (17-07: credits los selecteerbaar in
    // de AFAS-CSV) — alleen vervangen facturen blijven uitgesloten (defense-in-
    // depth, spiegelt selectableInvoiceIds in invoice-filters.ts).
    const { data: invoices } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .in("id", invoiceIds)
      .is("superseded_at", null);

    // Eén rij per factuur in het kolomformaat van de normale facturen (RugFlow-
    // verkoopoverzicht, feedback Nando 13-07) — Omschrijving en BTW-code zijn
    // vervallen; naam/adres/ordernummer/klantref/vervaldatum erbij (afas-csv.ts).
    // Snapshot-first (M7): bedragen komen uit de geboekte invoice-rij via
    // loadInvoiceRenderData; live-fallback blijft werken voor facturen zonder snapshot.
    // buildAfasCsv sorteert de rijen zelf op factuurnummer (debet vóór credit).
    const rows: AfasCsvRowInput[] = [];

    for (const inv of (invoices ?? []) as StoredInvoiceForRender[]) {
      const renderData = await loadInvoiceRenderData(supabaseAdmin, inv);
      if (!renderData) continue;
      const invoiceData = renderData.data;

      rows.push({
        clientNumber: invoiceData.clientNumber,
        clientName: invoiceData.clientName,
        street: invoiceData.billingAddress?.street ?? null,
        postalCode: invoiceData.billingAddress?.postalCode ?? null,
        city: invoiceData.billingAddress?.city ?? null,
        country: invoiceData.billingAddress?.country ?? null,
        orderNumber: invoiceData.orderNumber,
        orderReference: invoiceData.orderReference,
        invoiceNumber: inv.invoice_number,
        invoiceDate: inv.invoice_date,
        paymentDays: invoiceData.company?.payment_days ?? 14,
        btwPct: inv.btw_pct,
        subtotalCents: invoiceData.subtotalCents,
        btwCents: renderData.btwCents,
        totalCents: renderData.totalCents,
      });
    }

    const csv = buildAfasCsv(rows);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="afas-facturen-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
