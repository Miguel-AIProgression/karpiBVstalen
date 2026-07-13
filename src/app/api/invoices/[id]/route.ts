import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { checkInvoiceDeletable } from "@/lib/invoice-delete-guard";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * RAISE EXCEPTION-tekst uit de BEFORE DELETE-trigger `invoices_no_delete_when_sent`
 * komt via PostgREST als `error.message` — al Nederlands, maar sommige pg-foutpaden
 * zetten er een SQLSTATE-codeblok voor ("P0001: ..."). Zelfde patroon als
 * src/app/api/invoices/credit/route.ts.
 */
function stripPostgresPrefix(message: string): string {
  return message.replace(/^[A-Z0-9]{5}:\s*/, "").trim();
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabaseAdmin = getSupabaseAdmin();
  const auth = await requireRole(req, ["sales", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id is verplicht" }, { status: 400 });
    }

    const { data: invoice, error: fetchErr } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, sent_at")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: "Factuur ophalen is mislukt" }, { status: 500 });
    }
    if (!invoice) {
      return NextResponse.json({ error: "Factuur niet gevonden" }, { status: 404 });
    }

    const { data: creditNotes, error: creditErr } = await supabaseAdmin
      .from("invoices")
      .select("id")
      .eq("credited_invoice_id", id)
      .limit(1);

    if (creditErr) {
      return NextResponse.json({ error: "Creditnota's controleren is mislukt" }, { status: 500 });
    }

    const verdict = checkInvoiceDeletable({
      sentAt: invoice.sent_at,
      hasCreditNotes: (creditNotes?.length ?? 0) > 0,
    });
    if (!verdict.allowed) {
      return NextResponse.json({ error: verdict.error }, { status: verdict.status });
    }

    const { error: deleteErr } = await supabaseAdmin.from("invoices").delete().eq("id", id);
    if (deleteErr) {
      // BEFORE DELETE-trigger (gemailde factuur, race met de check hierboven) → P0001
      if (deleteErr.code === "P0001") {
        return NextResponse.json({ error: stripPostgresPrefix(deleteErr.message) }, { status: 409 });
      }
      // FK-RESTRICT (credited_invoice_id, race met de check hierboven) → 23503
      if (deleteErr.code === "23503") {
        return NextResponse.json(
          { error: "Deze factuur heeft creditnota's en kan niet verwijderd worden." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
