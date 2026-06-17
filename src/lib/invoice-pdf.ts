// Factuur-PDF generator — opmaak overgenomen van het Karpi-ERP project
// (FACTUUR-label + bedrijfsblok rechtsboven in Karpi-goud, factuuradres +
// factuurinfo, artikelregels-tabel, BTW-blok, bankgegevens in de footer).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { InvoiceData } from "./invoice-data";
import { formatCents, formatDate } from "./invoice-data";

export interface InvoicePdfInput {
  invoiceNumber: string;
  invoiceDate: string;
  btwPct: number;
  data: InvoiceData;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const KARPI_GOLD: [number, number, number] = [200, 134, 26];
const GRAY = [140, 140, 140] as const;
const DARK = [20, 20, 20] as const;

function formatSampleLabel(label: string): string {
  const joined = label.replace(/\s*—\s*/g, "-");
  const sentenceCase = joined.length > 0 ? joined[0].toUpperCase() + joined.slice(1).toLowerCase() : joined;
  return `Sample: ${sentenceCase}`;
}

function drawPageHeader(doc: jsPDF, co: InvoiceData["company"]) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.text("FACTUUR", MARGIN, 16);

  const rightX = PAGE_W - MARGIN;
  doc.setFontSize(11);
  doc.setTextColor(...KARPI_GOLD);
  doc.text(co?.company_name ?? "Karpi BV", rightX, 14, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  const addrLine = [co?.address_street, [co?.address_postal, co?.address_city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  if (addrLine) doc.text(addrLine, rightX, 19, { align: "right" });
  const contactLine = [co?.phone ? `t ${co.phone}` : null, co?.email ? `e ${co.email}` : null]
    .filter(Boolean)
    .join("   ");
  if (contactLine) doc.text(contactLine, rightX, 23.5, { align: "right" });

  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 27, PAGE_W - MARGIN, 27);
  doc.setTextColor(0, 0, 0);
}

function drawPageFooter(doc: jsPDF, co: InvoiceData["company"]) {
  const parts = [
    co?.kvk_number ? `k.v.k. ${co.kvk_number}` : null,
    co?.btw_number ? `btw ${co.btw_number}` : null,
    co?.bank_name ?? null,
    co?.iban ? `IBAN ${co.iban}` : null,
    co?.bic ? `BIC ${co.bic}` : null,
  ]
    .filter(Boolean)
    .join("   |   ");
  if (!parts) return;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text(parts, PAGE_W / 2, PAGE_H - 12, { align: "center", maxWidth: PAGE_W - 2 * MARGIN });
  doc.setTextColor(0, 0, 0);
}

function infoRow(doc: jsPDF, rightX: number, y: number, label: string, value: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text(value, rightX, y, { align: "right" });
  const valueWidth = doc.getTextWidth(value);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(`${label} `, rightX - valueWidth, y, { align: "right" });
}

function drawCustomerBlock(doc: jsPDF, input: InvoicePdfInput) {
  const { data } = input;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.text("FACTUURADRES", MARGIN, 38);

  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(data.clientName, MARGIN, 43);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  let y = 48;
  if (data.clientNumber) {
    doc.text(`Debiteur ${data.clientNumber}`, MARGIN, y);
    y += 4.5;
  }
  const addr = data.billingAddress;
  if (addr?.street) {
    doc.text(addr.street, MARGIN, y);
    y += 4.5;
  }
  if (addr?.postalCode || addr?.city) {
    doc.text([addr.postalCode, addr.city].filter(Boolean).join(" "), MARGIN, y);
    y += 4.5;
  }
  if (addr?.country) {
    doc.text(addr.country, MARGIN, y);
  }

  const rightX = PAGE_W - MARGIN;
  let ry = 38;
  if (data.clientNumber) {
    infoRow(doc, rightX, ry, "Uw debiteurnummer:", data.clientNumber);
    ry += 5;
  }
  infoRow(doc, rightX, ry, "Factuurnummer:", input.invoiceNumber);
  ry += 5;
  infoRow(doc, rightX, ry, "Factuurdatum:", formatDate(input.invoiceDate));
  ry += 5;
  infoRow(doc, rightX, ry, "Order:", data.orderNumber);
  ry += 5;
  if (data.orderReference) {
    infoRow(doc, rightX, ry, "Referentie:", data.orderReference);
  }

  doc.setTextColor(0, 0, 0);
}

export function generateInvoicePdf(input: InvoicePdfInput): Uint8Array {
  const { data, btwPct } = input;
  const co = data.company;
  const days = co?.payment_days ?? 14;
  const btwCents = Math.round((data.subtotalCents * btwPct) / 100);
  const totalCents = data.subtotalCents + btwCents;

  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const body: (string | { content: string; colSpan: number; styles: Record<string, unknown> })[][] = [];
  for (const l of data.lines) {
    if (l.isGroupStart && l.groupLabel) {
      body.push([
        {
          content: `${l.tag === "Collectie" ? "Collectie" : "Bundel"}: ${l.groupLabel}`,
          colSpan: 6,
          styles: { fillColor: [244, 244, 244], textColor: [110, 110, 110], fontStyle: "bold", fontSize: 7.5 },
        },
      ]);
    }
    body.push([
      l.articleNumber ?? "—",
      formatSampleLabel(l.label),
      l.dimensionName ?? "—",
      String(l.quantity),
      formatCents(l.unitPriceCents),
      formatCents(l.priceCents),
    ]);
  }

  autoTable(doc, {
    startY: 72,
    margin: { top: 32, bottom: 35, left: MARGIN, right: MARGIN },
    head: [["Artikel", "Omschrijving", "Afm.", "Aantal", "Stukprijs", "Totaal excl. BTW"]],
    body,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 1.8, lineColor: [225, 225, 225], lineWidth: 0.1 },
    headStyles: {
      fillColor: [250, 250, 250],
      textColor: [120, 120, 120],
      fontStyle: "bold",
      fontSize: 7.5,
      lineWidth: { top: 0, left: 0, right: 0, bottom: 0.5 },
      lineColor: [20, 20, 20],
    },
    columnStyles: {
      0: { cellWidth: 26, textColor: [140, 140, 140], fontSize: 8 },
      1: { cellWidth: "auto", fontStyle: "bold" },
      2: { cellWidth: 22, textColor: [110, 110, 110] },
      3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 24, halign: "right", textColor: [110, 110, 110] },
      5: { cellWidth: 30, halign: "right", fontStyle: "bold" },
    },
    didDrawPage: (hookData) => {
      drawPageHeader(doc, co);
      drawPageFooter(doc, co);
      if (hookData.pageNumber === 1) drawCustomerBlock(doc, input);
    },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  if (y > PAGE_H - 50) {
    doc.addPage();
    drawPageHeader(doc, co);
    drawPageFooter(doc, co);
    y = 35;
  }

  autoTable(doc, {
    startY: y,
    theme: "plain",
    tableWidth: 90,
    margin: { left: PAGE_W - MARGIN - 90 },
    styles: { fontSize: 9, cellPadding: 1.2 },
    head: [["Grondslag", "BTW %", "BTW bedrag", "Te betalen"]],
    body: [[formatCents(data.subtotalCents), `${btwPct}%`, formatCents(btwCents), formatCents(totalCents)]],
    headStyles: {
      textColor: [140, 140, 140],
      fontStyle: "bold",
      fontSize: 7,
      halign: "right",
      lineWidth: { top: 0, left: 0, right: 0, bottom: 0.5 },
      lineColor: [20, 20, 20],
    },
    bodyStyles: { halign: "right", fontStyle: "bold", textColor: [20, 20, 20] },
    columnStyles: { 3: { fontSize: 11 } },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(`Betalingscond.: ${days} dagen netto`, PAGE_W - MARGIN, y, { align: "right" });

  return new Uint8Array(doc.output("arraybuffer"));
}
