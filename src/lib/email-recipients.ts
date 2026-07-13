// Eén e-mailveld kan meerdere ontvangers bevatten: de klantdata heeft velden als
// "zr-pdf@einrichtungspartnerring.com, factuur@homecenter.nl" (HOME CENTER WOLVEGA)
// en trailing separators ("info@novaproject.nl,"). Graph verwacht een lijst
// recipients — één komma-string als adres wordt geweigerd. Gespiegeld op de
// RugFlow-seam _shared/email-list.ts.
//
// Pure functies; de IO staat in src/lib/graph-mail-client.ts + api/invoices/email.

/** Sanity-check, geen volledige RFC 5322-validatie. */
export const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Splitst op komma/puntkomma/whitespace en gooit lege stukken weg. */
export function parseEmailRecipients(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Geldig = minstens één adres én élk adres heeft een e-mailvorm. */
export function invalidRecipients(recipients: string[]): string[] {
  return recipients.filter((r) => !SIMPLE_EMAIL_RE.test(r));
}
