import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * RAISE EXCEPTION-tekst uit `supersede_invoice` (mig 20260713_icl_en_herfactureren.sql)
 * komt via PostgREST als `error.message` — al Nederlands, maar sommige pg-foutpaden
 * zetten er een SQLSTATE-codeblok voor ("P0001: ..."). Zelfde patroon als
 * src/app/api/invoices/[id]/route.ts en src/app/api/invoices/credit/route.ts.
 */
function stripPostgresPrefix(message: string): string {
  return message.replace(/^[A-Z0-9]{5}:\s*/, "").trim();
}

/**
 * Markeert een volledig gecrediteerde debetfactuur als vervangen (superseded_at).
 * Daarna staat de partial UNIQUE op invoices(order_id) een nieuwe debetfactuur
 * voor dezelfde order toe (herfactureren-na-volledige-credit).
 */
export async function POST(
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

    const { error } = await supabaseAdmin.rpc("supersede_invoice" as any, { p_invoice_id: id } as any);

    if (error) {
      // Alle inhoudelijke guards in de RPC (niet gevonden / creditnota / al
      // vervangen / niet volledig gecrediteerd) zijn RAISE EXCEPTION zonder eigen
      // SQLSTATE → altijd P0001, met een nette Nederlandse melding die veilig is
      // om te tonen.
      if (error.code === "P0001") {
        return NextResponse.json({ error: stripPostgresPrefix(error.message) }, { status: 409 });
      }
      console.error("supersede_invoice RPC-fout", error);
      return NextResponse.json(
        { error: "Er ging iets mis bij het vervangen van de factuur." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
