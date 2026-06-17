/**
 * Factuur-prijslogica — de ENIGE seam tussen order-regels en wat er op de
 * factuur én de Factuursamenvatting verschijnt.
 *
 * Kernregel: een collectie of bundel = ÉÉN factuurregel met ÉÉN prijs. De
 * prijs staat (gerepliceerd) op alle onderliggende `order_lines` van die groep
 * — bv. een maatwerkcollectie van 30 staaltjes draagt op elke regel €549 — maar
 * wordt hier exact één keer geteld. Losse stalen blijven één regel per staal.
 *
 * Dit garandeert dat de Factuursamenvatting op de orderdetailpagina en de
 * daadwerkelijke factuur exact hetzelfde totaal tonen: beide draaien op
 * `buildBillingRows` + `billingSubtotalCents`. De "Totaal instellen"-knop zet
 * het volledige bedrag op de eerste regel van een groep en €0 op de rest; die
 * eerste-regel-prijs is hier de representatieve groepsprijs.
 */

export type BillingTag = "Collectie" | "Bundel" | "Staal";

/**
 * Genormaliseerde order-regel. Beide callers (order-fulfillment ↦
 * Factuursamenvatting, en invoice-data ↦ factuur) mappen hun ruwe regels
 * hiernaartoe, zodat de groepering maar op één plek leeft.
 */
export interface BillingLineInput {
  lineId: string;
  bundleId: string | null;
  bundleName: string | null;
  collectionId: string | null;
  collectionName: string | null;
  /** Vastgelegde factuurprijs op de order-regel (collectie-, bundel- of staalprijs). */
  priceCents: number | null;
  quantity: number;
  // Weergavevelden (voor losse staalregels)
  qualityName: string;
  colorCode: string | null;
  colorName: string | null;
  articleNumber: string | null;
  dimensionName: string | null;
}

export interface BillingRow {
  /** Stabiele sleutel: `c:<id>` / `b:<id>` / `l:<lineId>`. */
  key: string;
  tag: BillingTag;
  /** Collectie-/bundelnaam, of "kwaliteit kleur" voor losse stalen. */
  label: string;
  /** De prijs van deze groep — wordt één keer geteld in het subtotaal. */
  priceCents: number | null;
  collectionId: string | null;
  bundleId: string | null;
  /** Alle order_line-IDs in deze groep (voor prijs-updates via de UI). */
  lineIds: string[];
  /** Aantal staalregels in de groep (1 voor losse stalen). */
  sampleCount: number;
  /** Som van de aantallen (stuks) over alle regels in de groep. */
  totalQuantity: number;
  /** Gemeenschappelijke afmeting als alle stalen dezelfde hebben, anders null. */
  dimensionName: string | null;
  /** De onderliggende regels (eerste = representatief voor weergave). */
  members: BillingLineInput[];
}

/**
 * Groepeer order-regels tot factuurregels: collecties eerst, dan losse bundels,
 * dan losse stalen — dezelfde volgorde als de Factuursamenvatting. De prijs van
 * een collectie/bundel is die van de eerste regel (representatief; alle regels
 * in een groep dragen dezelfde prijs).
 */
export function buildBillingRows(lines: BillingLineInput[]): BillingRow[] {
  const collectionRows = new Map<string, BillingRow>();
  const bundleRows = new Map<string, BillingRow>();
  const looseRows: BillingRow[] = [];

  const addMember = (row: BillingRow, line: BillingLineInput) => {
    row.lineIds.push(line.lineId);
    row.members.push(line);
    row.sampleCount += 1;
    row.totalQuantity += line.quantity;
    const dim = line.dimensionName ?? null;
    if (row.sampleCount === 1) row.dimensionName = dim;
    else if (row.dimensionName !== dim) row.dimensionName = null;
  };

  const newGroup = (
    key: string,
    tag: BillingTag,
    label: string,
    line: BillingLineInput,
    ids: { collectionId: string | null; bundleId: string | null }
  ): BillingRow => ({
    key,
    tag,
    label,
    priceCents: line.priceCents,
    collectionId: ids.collectionId,
    bundleId: ids.bundleId,
    lineIds: [],
    sampleCount: 0,
    totalQuantity: 0,
    dimensionName: null,
    members: [],
  });

  for (const line of lines) {
    if (line.collectionId && line.collectionName) {
      let row = collectionRows.get(line.collectionId);
      if (!row) {
        row = newGroup(`c:${line.collectionId}`, "Collectie", line.collectionName, line, {
          collectionId: line.collectionId,
          bundleId: null,
        });
        collectionRows.set(line.collectionId, row);
      }
      addMember(row, line);
    } else if (line.bundleId && line.bundleName) {
      let row = bundleRows.get(line.bundleId);
      if (!row) {
        row = newGroup(`b:${line.bundleId}`, "Bundel", line.bundleName, line, {
          collectionId: null,
          bundleId: line.bundleId,
        });
        bundleRows.set(line.bundleId, row);
      }
      addMember(row, line);
    } else {
      const label =
        [line.qualityName, line.colorCode].filter(Boolean).join(" ") ||
        line.articleNumber ||
        "Staal";
      const row = newGroup(`l:${line.lineId}`, "Staal", label, line, {
        collectionId: null,
        bundleId: null,
      });
      addMember(row, line);
      looseRows.push(row);
    }
  }

  return [...collectionRows.values(), ...bundleRows.values(), ...looseRows];
}

/** Subtotaal = som van de groepsprijzen (elke collectie/bundel één keer). */
export function billingSubtotalCents(rows: BillingRow[]): number {
  return rows.reduce((sum, r) => sum + (r.priceCents ?? 0), 0);
}
