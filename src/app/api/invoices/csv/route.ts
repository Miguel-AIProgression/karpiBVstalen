import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadInvoiceData, calcBtw } from "@/lib/invoice-data";
import { buildInvoiceLineRows, loadInvoiceRenderData, type StoredInvoiceForRender } from "@/lib/invoice-snapshot";
import { buildAfasCsv, type AfasCsvRowInput } from "@/lib/afas-csv";
import { requireRole } from "@/lib/auth/require-role";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logInvoiceEvent } from "@/lib/invoice-events";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
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
      .is("credited_invoice_id", null)
      .is("superseded_at", null);

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
          await logInvoiceEvent(supabaseAdmin, {
            invoiceId: inv.id,
            type: "aangemaakt",
            actorEmail: auth.user.email,
            details: { via: "csv-export" },
          });
        }
      }
    }

    // Eén rij per factuur in het kolomformaat van de normale facturen (RugFlow-
    // verkoopoverzicht, feedback Nando 13-07) — Omschrijving en BTW-code zijn
    // vervallen; naam/adres/ordernummer/klantref/vervaldatum erbij (afas-csv.ts).
    // Snapshot-first (M7): bedragen komen uit de geboekte invoice-rij via
    // loadInvoiceRenderData; live-fallback blijft werken voor facturen zonder snapshot.
    const rows: AfasCsvRowInput[] = [];

    for (const orderId of orderIds) {
      const inv = existingMap.get(orderId) ?? newInvoiceMap.get(orderId);
      if (!inv) continue;

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
