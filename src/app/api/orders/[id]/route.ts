import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Use service role key if available, fall back to anon key
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: "Server configuratie onvolledig" }, { status: 500 });
  }

  const supabase = createClient(url, key);

  // Delete order_lines first (FK constraint)
  const { error: linesErr } = await supabase.from("order_lines").delete().eq("order_id", id);
  if (linesErr) {
    return NextResponse.json({ error: `Orderregels verwijderen mislukt: ${linesErr.message}` }, { status: 500 });
  }

  // Delete the order itself
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
