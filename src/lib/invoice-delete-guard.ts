// Pure guard voor het verwijderen van een factuur (wayfinder-ticket 007).
// sent_at wint: een gemailde factuur mag nooit verwijderd worden, ook niet als
// er toevallig geen creditnota aan hangt. De DB dwingt dit al onomzeilbaar af
// (BEFORE DELETE-trigger `invoices_no_delete_when_sent` + FK-RESTRICT op
// credited_invoice_id) — deze functie geeft de route een nette 409 vóórdat het
// een DB-foutcode hoeft te vertalen.
export type InvoiceDeleteInput = {
  sentAt: string | null; // invoices.sent_at
  hasCreditNotes: boolean; // bestaat er een invoices-rij met credited_invoice_id = deze factuur?
};

export type InvoiceDeleteVerdict =
  | { allowed: true }
  | { allowed: false; status: 409; error: string };

export function checkInvoiceDeletable(input: InvoiceDeleteInput): InvoiceDeleteVerdict {
  if (input.sentAt !== null) {
    return {
      allowed: false,
      status: 409,
      error: "Gemailde factuur kan niet verwijderd worden — crediteer in plaats daarvan.",
    };
  }
  if (input.hasCreditNotes) {
    return {
      allowed: false,
      status: 409,
      error: "Deze factuur heeft creditnota's en kan niet verwijderd worden.",
    };
  }
  return { allowed: true };
}
