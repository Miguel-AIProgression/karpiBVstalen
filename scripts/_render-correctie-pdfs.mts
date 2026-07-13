// Rendert de drie correctie-documenten als PDF (zelfde seam als mail/preview),
// zodat ze vóór verzending gecontroleerd kunnen worden. Zet niets in de DB.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { loadInvoiceRenderData, type StoredInvoiceForRender } from "../src/lib/invoice-snapshot";
import { generateInvoicePdf } from "../src/lib/invoice-pdf";

process.loadEnvFile(".env.local");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

mkdirSync("scratch-pdf", { recursive: true });

for (const nr of ["STL-2026-049", "STL-2026-050", "STL-2026-051"]) {
  const { data: inv, error } = await admin.from("invoices").select("*").eq("invoice_number", nr).single();
  if (error || !inv) throw new Error(`${nr}: ${error?.message ?? "niet gevonden"}`);

  const render = await loadInvoiceRenderData(admin, inv as unknown as StoredInvoiceForRender);
  if (!render) throw new Error(`${nr}: geen renderdata`);

  let originalNumber: string | undefined;
  if (inv.credited_invoice_id) {
    const { data: orig } = await admin.from("invoices").select("invoice_number").eq("id", inv.credited_invoice_id).single();
    originalNumber = orig?.invoice_number;
  }

  const bytes = generateInvoicePdf({
    invoiceNumber: inv.invoice_number,
    invoiceDate: inv.invoice_date,
    btwPct: inv.btw_pct,
    data: render.data,
    btwCents: render.btwCents,
    totalCents: render.totalCents,
    documentType: inv.credited_invoice_id ? "credit" : "invoice",
    originalInvoiceNumber: originalNumber,
    creditReason: inv.credit_reason ?? undefined,
  });
  const path = `scratch-pdf/${nr}.pdf`;
  writeFileSync(path, bytes);
  console.log(`${path} — ${render.data.clientName} — totaal ${(render.totalCents / 100).toFixed(2)} (btw ${inv.btw_pct}%)`);
}
