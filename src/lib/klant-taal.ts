// Taalbepaling voor klant-facing facturatie-documenten (PDF + mail) in de
// stalen-app. Taal volgt het land van het factuuradres — dezelfde aanpak als
// RugFlow-ERP's bepaalTaal (supabase/functions/_shared/klant-taal.ts, andere
// repo), maar deze portefeuille kent alleen nl/de/en (geen fr-klanten).
// Landnormalisatie is hergebruikt van btw.ts (`normalizeCountry`, daar
// geëxporteerd voor dit doel) — geen tweede kopie van de diakriet-strip/
// lowercase-logica.
import { normalizeCountry } from "./btw";

export type FactuurTaal = "nl" | "de" | "en";

// Zelfde NL-schrijfwijzen als customerCountryLine (btw.ts) — bewust een even
// beperkte lijst, voor consistentie tussen "toon landregel" en "kies taal".
const NL_VARIANTEN = new Set(["nl", "nederland", "netherlands", "the netherlands"]);

// Duitsland/Oostenrijk/Zwitserland — nl/native/en-spellingen (net als
// EU_MEMBER_STATES in btw.ts voor Duitsland/Oostenrijk; Zwitserland is geen
// EU-lidstaat maar wél Duitstalig, dus hier apart toegevoegd voor taalkeuze).
const DE_AT_CH_VARIANTEN = new Set([
  "duitsland", "deutschland", "germany", "de",
  "oostenrijk", "osterreich", "austria", "at",
  "zwitserland", "schweiz", "switzerland", "ch",
]);

/**
 * Bepaalt de taal van de factuur-PDF + -mail uit het land van het
 * factuuradres. Geen land bekend (null/leeg) → nl (binnenlands is de veilige
 * default — de meeste klanten zonder geregistreerd land zijn legacy
 * NL-klanten). Een land dat wél bekend is maar niet als NL/DE/AT/CH herkend
 * wordt → en (veilige middenweg — geen aanname dat de klant Nederlands leest).
 */
export function bepaalFactuurTaal(country: string | null | undefined): FactuurTaal {
  const norm = normalizeCountry(country);
  if (!norm) return "nl";
  if (NL_VARIANTEN.has(norm)) return "nl";
  if (DE_AT_CH_VARIANTEN.has(norm)) return "de";
  return "en";
}
