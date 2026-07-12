import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface LineCreditInput {
  lineId: string;
  quantity: number;
}

interface CreditRequestBody {
  invoiceId: string;
  lineCredits?: LineCreditInput[];
  freeAmountCents?: number;
  freeAmountInclBtw?: boolean;
  freeDescription?: string;
  reason?: string;
}

/**
 * RAISE EXCEPTION-tekst uit `create_credit_invoice` (mig 20260712_credit_invoices.sql)
 * komt via PostgREST als `error.message` — al Nederlands en zonder wrapper in het
 * gewone geval, maar sommige pg-foutpaden zetten er een SQLSTATE-codeblok voor
 * ("P0001: ..."). Die technische ruis hoort niet in de UI-foutmelding.
 */
function stripPostgresPrefix(message: string): string {
  return message.replace(/^[A-Z0-9]{5}:\s*/, "").trim();
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["sales", "admin"]);
  if (auth instanceof NextResponse) return auth;

  let body: CreditRequestBody;
  try {
    body = (await req.json()) as CreditRequestBody;
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
  }

  const { invoiceId, lineCredits, freeAmountCents, freeAmountInclBtw, freeDescription, reason } = body;

  if (!invoiceId) {
    return NextResponse.json({ error: "invoiceId is verplicht" }, { status: 400 });
  }

  const hasLineCredits = lineCredits !== undefined && lineCredits !== null;
  const hasFreeAmount = freeAmountCents !== undefined && freeAmountCents !== null;
  if (hasLineCredits === hasFreeAmount) {
    return NextResponse.json(
      { error: "Kies precies één creditmodus: regels of vrij bedrag." },
      { status: 400 }
    );
  }

  const { data: creditId, error } = await supabaseAdmin.rpc("create_credit_invoice" as any, {
    p_invoice_id: invoiceId,
    p_line_credits: hasLineCredits
      ? lineCredits!.map((lc) => ({ invoice_line_id: lc.lineId, quantity: lc.quantity }))
      : null,
    p_free_amount_cents: hasFreeAmount ? freeAmountCents : null,
    p_free_amount_incl_btw: freeAmountInclBtw ?? false,
    p_free_description: freeDescription ?? null,
    p_reason: reason ?? null,
  } as any);

  if (error) {
    // RAISE EXCEPTION zonder eigen SQLSTATE geeft altijd P0001 — dat zijn de
    // inhoudelijke guards uit de RPC (bedrag/regels/modus), met een nette
    // Nederlandse melding die veilig is om te tonen. Andere errors (constraint-
    // violations, connectiviteit, etc.) zijn geen gebruikersfout — die loggen we
    // en tonen we generiek (M6).
    if (error.code === "P0001") {
      return NextResponse.json({ error: stripPostgresPrefix(error.message) }, { status: 422 });
    }
    console.error("create_credit_invoice RPC-fout", error);
    return NextResponse.json(
      { error: "Er ging iets mis bij het aanmaken van de creditnota." },
      { status: 500 }
    );
  }

  const { data: creditInvoice, error: fetchErr } = await supabaseAdmin
    .from("invoices")
    .select("invoice_number")
    .eq("id", creditId as string)
    .single();

  if (fetchErr || !creditInvoice) {
    return NextResponse.json(
      { error: "Creditnota is aangemaakt, maar het factuurnummer ophalen is mislukt" },
      { status: 500 }
    );
  }

  return NextResponse.json({ creditInvoiceId: creditId, invoiceNumber: creditInvoice.invoice_number });
}
