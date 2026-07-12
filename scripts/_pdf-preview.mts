// Preview-script voor de herbouwde factuur-PDF (RugFlow-opmaak, invoice-pdf.ts).
// Schrijft twee PDF's met fixture-data (géén DB-toegang nodig) naar scratch-pdf/,
// zodat de layout visueel te controleren is zonder de app te draaien.
// Draaien: npx tsx scripts/_pdf-preview.mts
import { mkdirSync, writeFileSync } from "node:fs";
import { generateInvoicePdf, type InvoicePdfInput } from "../src/lib/invoice-pdf";
import type { InvoiceData, InvoiceLine } from "../src/lib/invoice-data";

const OUT_DIR = "scratch-pdf";
mkdirSync(OUT_DIR, { recursive: true });

// — fixture-regels: één collectie-groepregel + twee losse stalen mét afmeting —
const collectieRegel: InvoiceLine = {
  label: "Karpi Voorjaarscollectie 2026",
  articleNumber: "3 staaltjes",
  colorCode: null,
  groupLabel: null,
  isGroupStart: false,
  tag: "Collectie",
  unitPriceCents: 1500,
  priceCents: 4500,
  quantity: 3,
  dimensionName: null,
  orderLineId: null,
};

const staal1: InvoiceLine = {
  label: "Gentle — Antraciet",
  articleNumber: "GENT-13",
  colorCode: "13",
  groupLabel: null,
  isGroupStart: false,
  tag: "Staal",
  unitPriceCents: 1800,
  priceCents: 1800,
  quantity: 1,
  dimensionName: "20x20",
  orderLineId: "ol-fixture-1",
};

const staal2: InvoiceLine = {
  label: "Colorado — Zand",
  articleNumber: "COLO-07",
  colorCode: "07",
  groupLabel: null,
  isGroupStart: false,
  tag: "Staal",
  unitPriceCents: 1600,
  priceCents: 3200,
  quantity: 2,
  dimensionName: "30x30",
  orderLineId: "ol-fixture-2",
};

const subtotalCents = collectieRegel.priceCents + staal1.priceCents + staal2.priceCents; // 9500
const btwPct = 21;
const btwCents = Math.round((subtotalCents * btwPct) / 100); // 1995
const totalCents = subtotalCents + btwCents; // 11495

// Factuurvoorbeeld: mét ingevulde company_settings (test het data-gedreven headerpad).
const factuurData: InvoiceData = {
  orderNumber: "ORD-2026-0456",
  orderReference: "PO-2026-9981",
  clientName: "Interieur De Vries BV",
  clientNumber: "4021",
  billingAddress: { street: "Marktstraat 12", postalCode: "3811 AB", city: "Amersfoort", country: "Nederland" },
  shippingAddress: null,
  clientEmail: "inkoop@devries-interieur.nl",
  lines: [collectieRegel, staal1, staal2],
  subtotalCents,
  company: {
    company_name: "Karpi BV",
    address_street: "Tweede Broekdijk 10",
    address_postal: "7122 LB",
    address_city: "Aalten",
    address_country: "NL",
    phone: "+31 (0)543-476116",
    email: "info@karpi.nl",
    kvk_number: "09060322",
    btw_number: "NL008543446B01",
    iban: "NL37INGB0689412401",
    bic: "INGBNL2A",
    bank_name: "ING Bank",
    payment_days: 14,
  },
};

const factuurInput: InvoicePdfInput = {
  invoiceNumber: "STL-2026-0456",
  invoiceDate: "2026-07-12",
  btwPct,
  data: factuurData,
  btwCents,
  totalCents,
};

// Creditnotavoorbeeld: company_settings ontbreekt (null) → test de vaste fallback-strings.
// RugFlow-/credit-RPC-conventie: Aantal en Prijs (unit_price_cents) blijven POSITIEF,
// alleen Bedrag (amount_cents) is negatief.
const creditData: InvoiceData = {
  ...factuurData,
  company: null,
  lines: [
    { ...collectieRegel, priceCents: -collectieRegel.priceCents },
    { ...staal1, priceCents: -staal1.priceCents },
    { ...staal2, priceCents: -staal2.priceCents },
  ],
  subtotalCents: -subtotalCents,
};

const creditInput: InvoicePdfInput = {
  invoiceNumber: "STL-2026-0457",
  invoiceDate: "2026-07-13",
  btwPct,
  data: creditData,
  btwCents: -btwCents,
  totalCents: -totalCents,
  documentType: "credit",
  originalInvoiceNumber: "STL-2026-0456",
  // Lange reden (~300 tekens): maakt de dynamische tabel-start zichtbaar — het
  // infoblok groeit voorbij y=82 en de tabelheader schuift mee omlaag.
  creditReason:
    "Klant heeft op 11-07-2026 een retourzending aangemeld voor de complete order omdat meerdere stalen " +
    "tijdens het transport beschadigd zijn geraakt; na telefonisch overleg met de vertegenwoordiger is " +
    "besloten de volledige factuur te crediteren en de stalen kosteloos opnieuw te leveren zodra de nieuwe " +
    "productierun gereed is.",
};

writeFileSync(`${OUT_DIR}/factuur-voorbeeld.pdf`, generateInvoicePdf(factuurInput));
writeFileSync(`${OUT_DIR}/creditnota-voorbeeld.pdf`, generateInvoicePdf(creditInput));

console.log(`PDF's geschreven naar ${OUT_DIR}/factuur-voorbeeld.pdf en ${OUT_DIR}/creditnota-voorbeeld.pdf`);
