// Factuurgeschiedenis (invoice_events, mig 20260713_invoice_events_sent_to.sql).
// Best-effort logging vanuit de service-role-routes: een logfout mag de
// hoofdactie (mailen/crediteren/aanmaken) nooit laten falen.
import type { SupabaseClient } from "@supabase/supabase-js";

export type InvoiceEventType = "aangemaakt" | "gemaild" | "creditnota_aangemaakt" | "vervangen";

export async function logInvoiceEvent(
  admin: SupabaseClient,
  input: {
    invoiceId: string;
    type: InvoiceEventType;
    actorEmail?: string | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await admin.from("invoice_events" as any).insert({
    invoice_id: input.invoiceId,
    event_type: input.type,
    actor_email: input.actorEmail ?? null,
    details: input.details ?? {},
  });
  if (error) {
    console.error(`invoice_events loggen mislukt (${input.type}, factuur ${input.invoiceId}):`, error);
  }
}

/** NL-labels voor de UI (Geschiedenis-sectie in de InvoiceModal). */
export const INVOICE_EVENT_LABELS: Record<string, string> = {
  aangemaakt: "Aangemaakt",
  gemaild: "Gemaild",
  creditnota_aangemaakt: "Creditnota aangemaakt",
  vervangen: "Vervangen door nieuwe factuur",
};
