import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadInvoiceData, calcBtw } from "@/lib/invoice-data";
import { buildInvoiceLineRows, loadInvoiceRenderData, type StoredInvoiceForRender } from "@/lib/invoice-snapshot";
import { requireRole } from "@/lib/auth/require-role";

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
  const auth = await requireRole(req, ["sales", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { orderIds, btwPct = 21 } = await req.json() as {
      orderIds: string[];
      btwPct: 0 | 9 | 21;
    };

    if (!orderIds?.length) {
      return NextResponse.json({ error: "Geen orders opgegeven" }, { status: 400 });
    }

    // Haal bestaande debetfacturen op voor deze orders (creditnota's negeren — ticket 006)
    const { data: existingInvoices } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .in("order_id", orderIds)
      .is("credited_invoice_id", null);

    const existingMap = new Map<string, StoredInvoiceForRender>(
      (existingInvoices ?? []).map(inv => [inv.order_id, inv as StoredInvoiceForRender])
    );

    // Haal client_id per order op voor orders zonder factuur
    const ordersWithoutInvoice = orderIds.filter(id => !existingMap.has(id));
    const newInvoiceMap = new Map<string, StoredInvoiceForRender>();

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

        if (inv) {
          newInvoiceMap.set(order.id, inv as StoredInvoiceForRender);
          // ponytail: snapshot-fout is geen reden om de factuur terug te draaien — de
          // render-laag (loadInvoiceRenderData) valt terug op live data als de snapshot ontbreekt.
          const { error: lineErr } = await supabaseAdmin
            .from("invoice_lines")
            .insert(buildInvoiceLineRows(inv.id, invoiceData));
          if (lineErr) {
            console.error("Factuurregel-snapshot mislukt voor factuur", inv.id, lineErr);
          }
        }
      }
    }

    // Genereer CSV-regels
    const BOM = "﻿";
    const header = "Debiteur;Factuurnummer;Factuurdatum;Omschrijving;Bedrag excl. BTW;BTW-code;BTW-bedrag;Bedrag incl. BTW";
    const rows: string[] = [];

    for (const orderId of orderIds) {
      const inv = existingMap.get(orderId) ?? newInvoiceMap.get(orderId);
      if (!inv) continue;

      // (M7) Snapshot-first — zelfde render-seam als PDF/mail/modal-preview, zodat
      // de AFAS-CSV de daadwerkelijk geboekte regelbedragen exporteert i.p.v. een
      // live herberekening die kan afwijken als order_lines ná facturatie muteerden.
      // Live-fallback (loadInvoiceRenderData → geen snapshot) blijft automatisch
      // werken voor facturen van vóór de invoice_lines-migratie.
      const renderData = await loadInvoiceRenderData(supabaseAdmin, inv);
      if (!renderData) continue;
      const invoiceData = renderData.data;

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
