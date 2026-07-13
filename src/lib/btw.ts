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

// EU-lidstaten (excl. NL) — normaliseerde spellingen (nl/native/en), diakriet-vrij.
// Positieve match: alleen een herkende EU-lidstaat leidt tot ICL. Onbekende of
// verkeerd gespelde landen (incl. NL-varianten als "Holland") vallen bewust op
// het binnenlandse tarief terug — de veilige richting (nooit onterecht 0%).
const EU_MEMBER_STATES = new Set([
  "belgie", "belgium", "belgique", "belgien",
  "duitsland", "germany", "deutschland", "allemagne", "de",
  "frankrijk", "france", "frankreich", "fr",
  "luxemburg", "luxembourg", "lu",
  "oostenrijk", "austria", "osterreich", "at",
  "italie", "italy", "italia", "italien", "it",
  "spanje", "spain", "espana", "espagne", "es",
  "portugal", "pt",
  "ierland", "ireland", "irland", "ie",
  "denemarken", "denmark", "danmark", "danemark", "dk",
  "zweden", "sweden", "sverige", "se",
  "finland", "suomi", "fi",
  "polen", "poland", "polska", "pologne", "pl",
  "tsjechie", "czechia", "czech republic", "cz",
  "slowakije", "slovakia", "sk",
  "hongarije", "hungary", "hu",
  "roemenie", "romania", "ro",
  "bulgarije", "bulgaria", "bg",
  "griekenland", "greece", "gr",
  "kroatie", "croatia", "hr",
  "slovenie", "slovenia", "si",
  "estland", "estonia", "ee",
  "letland", "latvia", "lv",
  "litouwen", "lithuania", "lt",
  "cyprus", "cy",
  "malta", "mt",
]);

function normalizeCountry(country: string | null | undefined): string {
  return (country ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "") // diakriet weg (Österreich → osterreich)
    .toLowerCase().replace(/\./g, "").trim();
}

/** Is dit land een herkende EU-lidstaat (excl. NL)? Basis voor de ICL-check. */
export function isEuForeignCountry(country: string | null | undefined): boolean {
  return EU_MEMBER_STATES.has(normalizeCountry(country));
}

/**
 * Default BTW% bij het aanmaken van een factuur: 0% (ICL) alleen wanneer het land
 * een herkende EU-lidstaat (niet NL) is én er een btw-nummer van de klant bekend
 * is. Anders het binnenlandse tarief 21%. Onbekende/foutgespelde landen → 21%
 * (veilige richting). Puur een default — de gebruiker kan 'm altijd overriden via
 * de BTW-select vóór opslaan (zie invoice-modal.tsx).
 */
export function defaultBtwPct(input: { country: string | null; vatNumber: string | null }): number {
  const hasVatNumber = Boolean(input.vatNumber?.trim());
  return isEuForeignCountry(input.country) && hasVatNumber ? 0 : 21;
}

/**
 * Tekst voor de ICL-vrijstellingsregel op de factuur-PDF (RugFlow-conform,
 * exacte bewoording) — alleen bij 0% btw, een bekend btw-nummer van de afnemer,
 * én een herkende EU-lidstaat als land. Zo verschijnt de intracommunautaire
 * verklaring nooit op een binnenlandse (0%-om-andere-reden) factuur.
 */
export function iclNotice(
  btwPct: number,
  vatNumber: string | null,
  country: string | null | undefined,
): string | null {
  const trimmed = vatNumber?.trim();
  if (btwPct !== 0 || !trimmed || !isEuForeignCountry(country)) return null;
  return `Vrijgestelde intracommunautaire levering — btw-nr afnemer: ${trimmed}`;
}
