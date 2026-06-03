import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadInvoiceData, calcBtw } from "@/lib/invoice-data";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// AFAS BTW-codes: 0%→"0", 9%→"L", 21%→"H"
function afasBtwCode(pct: number): string {
  if (pct === 0) return "0";
  if (pct === 9) return "L";
  return "H";
}

function dutchCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function dutchDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

export async function POST(req: NextRequest) {
  try {
    const { orderIds, btwPct = 21 } = await req.json() as {
      orderIds: string[];
      btwPct: 0 | 9 | 21;
    };

    if (!orderIds?.length) {
      return NextResponse.json({ error: "Geen orders opgegeven" }, { status: 400 });
    }

    // Haal bestaande facturen op voor deze orders
    const { data: existingInvoices } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .in("order_id", orderIds);

    const existingMap = new Map((existingInvoices ?? []).map(inv => [inv.order_id, inv]));

    // Haal client_id per order op voor orders zonder factuur
    const ordersWithoutInvoice = orderIds.filter(id => !existingMap.has(id));
    let newInvoiceMap = new Map<string, { invoice_number: string; btw_pct: number; invoice_date: string; client_id: string }>();

    if (ordersWithoutInvoice.length > 0) {
      const { data: ordersData } = await supabaseAdmin
        .from("orders")
        .select("id, client_id")
        .in("id", ordersWithoutInvoice);

      for (const order of (ordersData ?? []) as { id: string; client_id: string }[]) {
        // Maak factuur aan
        const invoiceData = await loadInvoiceData(supabaseAdmin, order.id, order.client_id);
        if (!invoiceData) continue;

        const { btwCents, totalCents } = calcBtw(invoiceData.subtotalCents, btwPct);

        const { data: numRow } = await supabaseAdmin.rpc("next_invoice_number" as any);
        if (!numRow) continue;

        const { data: inv } = await supabaseAdmin
          .from("invoices")
          .insert({
            invoice_number: numRow as string,
            order_id: order.id,
            client_id: order.client_id,
            btw_pct: btwPct,
            subtotal_cents: invoiceData.subtotalCents,
            btw_cents: btwCents,
            total_cents: totalCents,
          })
          .select()
          .single();

        if (inv) newInvoiceMap.set(order.id, inv);
      }
    }

    // Genereer CSV-regels
    const BOM = "﻿";
    const header = "Debiteur;Factuurnummer;Factuurdatum;Omschrijving;Bedrag excl. BTW;BTW-code;BTW-bedrag;Bedrag incl. BTW";
    const rows: string[] = [];

    for (const orderId of orderIds) {
      const inv = existingMap.get(orderId) ?? newInvoiceMap.get(orderId);
      if (!inv) continue;

      // Haal client_id op
      let clientId = inv.client_id;
      const invoiceData = await loadInvoiceData(supabaseAdmin, orderId, clientId);
      if (!invoiceData) continue;

      const invoicePct = inv.btw_pct ?? btwPct;
      const btwCode = afasBtwCode(invoicePct);
      const invDate = dutchDate(inv.invoice_date);
      const debiteur = invoiceData.clientNumber ?? invoiceData.clientName;

      for (const line of invoiceData.lines) {
        const exclCents = line.priceCents;
        const btwCents = Math.round(exclCents * invoicePct / 100);
        const inclCents = exclCents + btwCents;

        rows.push([
          debiteur,
          inv.invoice_number,
          invDate,
          `"${line.label.replace(/"/g, '""')}"`,
          dutchCents(exclCents),
          btwCode,
          dutchCents(btwCents),
          dutchCents(inclCents),
        ].join(";"));
      }
    }

    const csv = BOM + header + "\r\n" + rows.join("\r\n");

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
