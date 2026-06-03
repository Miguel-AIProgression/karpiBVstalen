import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calcBtw, loadInvoiceData } from "@/lib/invoice-data";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { orderId, clientId, btwPct = 21 } = await req.json() as {
      orderId: string;
      clientId: string;
      btwPct: 0 | 9 | 21;
    };

    if (!orderId || !clientId) {
      return NextResponse.json({ error: "orderId en clientId zijn verplicht" }, { status: 400 });
    }

    // Check of er al een factuur is voor deze order
    const { data: existing } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ invoice: existing });
    }

    // Haal factuurdata op om totalen te berekenen
    const invoiceData = await loadInvoiceData(supabaseAdmin, orderId, clientId);
    if (!invoiceData) {
      return NextResponse.json({ error: "Order niet gevonden" }, { status: 404 });
    }

    const { btwCents, totalCents } = calcBtw(invoiceData.subtotalCents, btwPct);

    // Genereer volgend factuurnummer (Postgres advisory lock zorgt voor serialisatie)
    const { data: numRow, error: numErr } = await supabaseAdmin
      .rpc("next_invoice_number" as any);

    if (numErr || !numRow) {
      return NextResponse.json({ error: "Factuurnummer genereren mislukt" }, { status: 500 });
    }

    const { data: invoice, error: insertErr } = await supabaseAdmin
      .from("invoices")
      .insert({
        invoice_number: numRow as string,
        order_id: orderId,
        client_id: clientId,
        btw_pct: btwPct,
        subtotal_cents: invoiceData.subtotalCents,
        btw_cents: btwCents,
        total_cents: totalCents,
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ invoice });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
