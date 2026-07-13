// Pure BTW-/landhelpers — o.a. ICL (intracommunautaire levering): 0% btw voor
// EU-klanten met een bekend btw-nummer (migratie 20260713_icl_en_herfactureren.sql,
// besluit Miguel 13-07). `customerCountryLine` woonde eerder in invoice-pdf.ts;
// verplaatst hierheen zodat invoice-pdf.ts 'm kan importeren zonder een cirkel
// (invoice-pdf.ts → btw.ts → invoice-pdf.ts) — invoice-pdf.ts re-exporteert 'm
// voor bestaande callers/tests.

/**
 * Landregel in het klantblok (RugFlow-conventie: uppercase). Alleen tonen als
 * het land bekend is én afwijkt van NL/Nederland — binnenlandse facturen
 * krijgen geen landregel. Ook de basis voor `defaultBtwPct`: een niet-lege
 * uitkomst betekent "bekend, buitenlands (niet-NL)".
 */
export function customerCountryLine(country: string | null | undefined): string | null {
  const trimmed = country?.trim();
  if (!trimmed) return null;
  const norm = trimmed.toLowerCase().replace(/\./g, "");
  if (norm === "nl" || norm === "nederland" || norm === "netherlands" || norm === "the netherlands") return null;
  return trimmed.toUpperCase();
}

/**
 * Default BTW% bij het aanmaken van een factuur: 0% (ICL) wanneer het land
 * bekend is, niet NL/Nederland (elke schrijfwijze — spiegelt `customerCountryLine`),
 * én er een btw-nummer van de klant bekend is. Anders het binnenlandse tarief 21%.
 * Puur een default — de gebruiker kan 'm altijd overriden via de BTW-select
 * vóór opslaan (zie invoice-modal.tsx).
 */
export function defaultBtwPct(input: { country: string | null; vatNumber: string | null }): number {
  const isKnownForeignCountry = customerCountryLine(input.country) !== null;
  const hasVatNumber = Boolean(input.vatNumber?.trim());
  return isKnownForeignCountry && hasVatNumber ? 0 : 21;
}

/**
 * Tekst voor de ICL-vrijstellingsregel op de factuur-PDF (RugFlow-conform,
 * exacte bewoording) — alleen bij 0% btw mét een bekend btw-nummer van de
 * afnemer. 0% zonder btw-nummer is geen ICL (bv. een andere vrijstellingsgrond)
 * en krijgt hier bewust geen regel.
 */
export function iclNotice(btwPct: number, vatNumber: string | null): string | null {
  const trimmed = vatNumber?.trim();
  if (btwPct !== 0 || !trimmed) return null;
  return `Vrijgestelde intracommunautaire levering — btw-nr afnemer: ${trimmed}`;
}
