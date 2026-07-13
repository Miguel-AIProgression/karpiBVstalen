import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calcBtw, loadInvoiceData } from "@/lib/invoice-data";
import { buildInvoiceLineRows } from "@/lib/invoice-snapshot";
import { requireRole } from "@/lib/auth/require-role";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["sales", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { orderId, clientId, btwPct = 21 } = await req.json() as {
      orderId: string;
      clientId: string;
      btwPct: 0 | 9 | 21;
    };

    if (!orderId || !clientId) {
      return NextResponse.json({ error: "orderId en clientId zijn verplicht" }, { status: 400 });
    }

    // Check of er al een debetfactuur is voor deze order (creditnota's negeren — ticket 006)
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("order_id", orderId)
      .is("credited_invoice_id", null)
      .is("superseded_at", null)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ error: "Bestaande factuur controleren is mislukt" }, { status: 500 });
    }

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

    // ponytail: snapshot-fout is geen reden om de factuur terug te draaien — de
    // render-laag (loadInvoiceRenderData) valt terug op live data als de snapshot ontbreekt.
    const { error: lineErr } = await supabaseAdmin
      .from("invoice_lines")
      .insert(buildInvoiceLineRows(invoice.id, invoiceData));
    if (lineErr) {
      console.error("Factuurregel-snapshot mislukt voor factuur", invoice.id, lineErr);
    }

    return NextResponse.json({ invoice });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
