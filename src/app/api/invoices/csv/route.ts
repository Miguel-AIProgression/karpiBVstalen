import { NextRequest, NextResponse } from "next/server";
import { loadInvoiceRenderData, type StoredInvoiceForRender } from "@/lib/invoice-snapshot";
import { buildAfasXlsx, type AfasXlsxRowInput } from "@/lib/afas-xlsx";
import { requireRole } from "@/lib/auth/require-role";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// PostgREST/Supabase-gateway verwerpt een `.in()`-query met te veel id's in de
// URL (live geverifieerd 17-07: >~350 UUID's faalt hard, ~78KB bij 2000 id's)
// — batchen voorkomt dat een grote AFAS-CSV-selectie de export laat crashen.
const INVOICE_ID_BATCH_SIZE = 200;

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const auth = await requireRole(req, ["sales", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { invoiceIds } = (await req.json()) as { invoiceIds: unknown };

    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return NextResponse.json({ error: "Geen facturen opgegeven" }, { status: 400 });
    }

    // Debet- én creditfacturen mogen mee (17-07: credits los selecteerbaar in
    // de AFAS-CSV) — alleen vervangen facturen blijven uitgesloten (defense-in-
    // depth, spiegelt selectableInvoiceIds in invoice-filters.ts).
    const invoices: StoredInvoiceForRender[] = [];
    for (let i = 0; i < invoiceIds.length; i += INVOICE_ID_BATCH_SIZE) {
      const batch = invoiceIds.slice(i, i + INVOICE_ID_BATCH_SIZE) as string[];
      const { data, error } = await supabaseAdmin
        .from("invoices")
        .select("*")
        .in("id", batch)
        .is("superseded_at", null);
      if (error) throw error;
      invoices.push(...((data ?? []) as StoredInvoiceForRender[]));
    }

    // Eén rij per factuur in het kolomformaat van de normale facturen (RugFlow-
    // verkoopoverzicht, feedback Nando 13-07) — Omschrijving en BTW-code zijn
    // vervallen; naam/adres/ordernummer/klantref/vervaldatum erbij (afas-xlsx.ts).
    // Snapshot-first (M7): bedragen komen uit de geboekte invoice-rij via
    // loadInvoiceRenderData; live-fallback blijft werken voor facturen zonder snapshot.
    // buildAfasXlsx sorteert de rijen zelf op factuurnummer (debet vóór credit).
    const rows: AfasXlsxRowInput[] = [];

    for (const inv of invoices) {
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

    const xlsx = buildAfasXlsx(rows);

    // NextResponse/Response verwacht BodyInit; Node's Buffer-generic (Buffer<ArrayBufferLike>)
    // matcht dat type niet 1-op-1 (zie ook livetest: response.arrayBuffer() geeft de bytes terug).
    return new NextResponse(new Uint8Array(xlsx), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="afas-facturen-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
