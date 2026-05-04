import { describe, expect, it } from "vitest";
import {
  buildShortages,
  stockKey,
  type OrderDemand as PlanningOrderDemand,
  type SampleInfo as PlanningSampleInfo,
  type ShortageRow,
} from "@/lib/productie/planning";
import {
  buildShortagesFromVoorraadbeeld,
  type BuildShortagesFromVoorraadbeeldOptions,
} from "./shortages";
import type {
  OrderDemand,
  OrderLineDemand,
  SampleInfo,
  StockKey,
  Voorraadbeeld,
} from "./types";

const UTC = (s: string) => new Date(s + "T00:00:00Z");
const TODAY = UTC("2026-04-06"); // Monday, ISO 2026-W15

// -------------------------------------------------------------------------
// Factories — Voorraadbeeld-shape
// -------------------------------------------------------------------------

function vbSample(
  qid: string,
  cid: string,
  did: string,
  overrides: Partial<SampleInfo> = {},
): SampleInfo {
  return {
    id: `sample-${qid}-${cid}-${did}`,
    articleNumber: `${qid}-${cid}-${did}`,
    qualityId: qid,
    colorCodeId: cid,
    dimensionId: did,
    minStock: 0,
    location: null,
    ...overrides,
  };
}

function vbLine(s: SampleInfo, quantity: number): OrderLineDemand {
  return {
    sampleId: s.id,
    stockKey: stockKey(s.qualityId, s.colorCodeId, s.dimensionId),
    quantity,
  };
}

function vbOrder(
  orderId: string,
  orderNumber: string,
  deliveryDate: Date | null,
  lines: OrderLineDemand[],
): OrderDemand {
  return {
    orderId,
    orderNumber,
    status: "open",
    deliveryDate,
    lines,
    legacyLineCount: 0,
  };
}

function makeVoorraadbeeld(
  samples: SampleInfo[],
  finishedEntries: Array<[StockKey, number]>,
  openOrders: OrderDemand[],
  today: Date = TODAY,
): Voorraadbeeld {
  const samplesByKey = new Map<StockKey, SampleInfo>();
  const samplesById = new Map<string, SampleInfo>();
  for (const s of samples) {
    samplesByKey.set(stockKey(s.qualityId, s.colorCodeId, s.dimensionId), s);
    samplesById.set(s.id, s);
  }
  return {
    today,
    samplesByKey,
    samplesById,
    finishedStock: new Map(finishedEntries),
    openOrders,
  };
}

// -------------------------------------------------------------------------
// Factories — planning-shape (display-velden)
// -------------------------------------------------------------------------

function planningSample(
  qid: string,
  cid: string,
  did: string,
  overrides: Partial<PlanningSampleInfo> = {},
): PlanningSampleInfo {
  return {
    qualityId: qid,
    colorCodeId: cid,
    dimensionId: did,
    qualityName: `Q-${qid}`,
    colorName: `C-${cid}`,
    hexColor: null,
    dimensionName: `D-${did}`,
    minStock: 0,
    ...overrides,
  };
}

function planningSamplesMap(
  ...infos: PlanningSampleInfo[]
): ReadonlyMap<StockKey, PlanningSampleInfo> {
  const m = new Map<StockKey, PlanningSampleInfo>();
  for (const i of infos) m.set(stockKey(i.qualityId, i.colorCodeId, i.dimensionId), i);
  return m;
}

// Deep-equal helper: sort by deadline (nulls last) + quality_id to remove
// non-determinism from Map.entries() iteration order across the two paths.
function sortRows(rows: ShortageRow[]): ShortageRow[] {
  return [...rows].sort((a, b) => {
    if (a.deadline === null && b.deadline !== null) return 1;
    if (a.deadline !== null && b.deadline === null) return -1;
    if (a.deadline !== null && b.deadline !== null && a.deadline !== b.deadline) {
      return a.deadline < b.deadline ? -1 : 1;
    }
    if (a.reason !== b.reason) return a.reason < b.reason ? -1 : 1;
    if (a.quality_id !== b.quality_id) return a.quality_id < b.quality_id ? -1 : 1;
    if (a.color_code_id !== b.color_code_id) return a.color_code_id < b.color_code_id ? -1 : 1;
    return a.dimension_id < b.dimension_id ? -1 : 1;
  });
}

// -------------------------------------------------------------------------
// Equivalence: Voorraadbeeld-wrapper ≡ direct buildShortages-call
// -------------------------------------------------------------------------

describe("buildShortagesFromVoorraadbeeld — equivalence with buildShortages", () => {
  it("yields identical rows as a direct buildShortages call on the same data", () => {
    // Twee samples; één met backorder-shortage + min-stock buffer, één puur
    // min-stock. Eén order zonder leverdatum + één order met leverdatum.
    const sA = vbSample("qA", "cA", "dA", { minStock: 3 });
    const sB = vbSample("qB", "cB", "dB", { minStock: 5 });
    const kA = stockKey("qA", "cA", "dA");
    const kB = stockKey("qB", "cB", "dB");

    const orderWithDate = vbOrder("o-1", "ORD-001", UTC("2026-05-01"), [vbLine(sA, 10)]);
    const orderNoDate = vbOrder("o-2", "ORD-002", null, [vbLine(sB, 1)]);

    const vb = makeVoorraadbeeld(
      [sA, sB],
      [
        [kA, 2],
        [kB, 4],
      ],
      [orderWithDate, orderNoDate],
    );

    // Display-velden voor de equivalence-call: identiek aan wat de planning-
    // testfactory `sample()` zou produceren.
    const planningSamples = planningSamplesMap(
      planningSample("qA", "cA", "dA", { minStock: 3 }),
      planningSample("qB", "cB", "dB", { minStock: 5 }),
    );

    const opts: BuildShortagesFromVoorraadbeeldOptions = { planningSamples };
    const viaWrapper = buildShortagesFromVoorraadbeeld(vb, opts);

    const orders: PlanningOrderDemand[] = [
      { deliveryDate: "2026-05-01", lines: [{ sampleKeys: [kA], quantity: 10 }] },
      { deliveryDate: null, lines: [{ sampleKeys: [kB], quantity: 1 }] },
    ];
    const direct = buildShortages({
      today: TODAY,
      samples: planningSamples,
      finishedStock: new Map([
        [kA, 2],
        [kB, 4],
      ]),
      orders,
    });

    expect(sortRows(viaWrapper)).toEqual(sortRows(direct));
    // Sanity: actually produced shortage rows.
    expect(viaWrapper.length).toBeGreaterThan(0);
  });

  it("propagates leadTimeDays to buildShortages", () => {
    const s = vbSample("q", "c", "d");
    const k = stockKey("q", "c", "d");
    const order = vbOrder("o-1", "ORD-001", UTC("2026-05-01"), [vbLine(s, 5)]);
    const vb = makeVoorraadbeeld([s], [[k, 2]], [order]);
    const planningSamples = planningSamplesMap(planningSample("q", "c", "d"));

    const default7 = buildShortagesFromVoorraadbeeld(vb, { planningSamples });
    const explicit14 = buildShortagesFromVoorraadbeeld(vb, {
      planningSamples,
      leadTimeDays: 14,
    });

    expect(default7).toHaveLength(1);
    expect(explicit14).toHaveLength(1);
    // 2026-05-01 minus 7 days → 2026-04-24 (Friday of ISO 2026-W17)
    expect(default7[0].deadline).toBe("2026-04-24");
    // 2026-05-01 minus 14 days → 2026-04-17 (Friday of ISO 2026-W16)
    expect(explicit14[0].deadline).toBe("2026-04-17");
  });
});

// -------------------------------------------------------------------------
// Edge cases
// -------------------------------------------------------------------------

describe("buildShortagesFromVoorraadbeeld — edge cases", () => {
  it("returns empty list when there are no orders and no min-stock requirements", () => {
    const s = vbSample("q", "c", "d", { minStock: 0 });
    const k = stockKey("q", "c", "d");
    const vb = makeVoorraadbeeld([s], [[k, 0]], []);

    const result = buildShortagesFromVoorraadbeeld(vb);
    expect(result).toEqual([]);
  });

  it("an order with null deliveryDate produces a backorder row without deadline", () => {
    const s = vbSample("q", "c", "d");
    const order = vbOrder("o-1", "ORD-001", null, [vbLine(s, 5)]);
    const vb = makeVoorraadbeeld([s], [], [order]);

    const result = buildShortagesFromVoorraadbeeld(vb);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      reason: "backorder",
      needed: 5,
      finished: 0,
      shortage: 5,
      deadline: null,
    });
  });

  it("falls back to placeholder display fields when planningSamples is omitted", () => {
    // Min-stock-only sample → minimum-row uses display fields directly.
    const s = vbSample("q", "c", "d", { minStock: 7 });
    const vb = makeVoorraadbeeld([s], [[stockKey("q", "c", "d"), 1]], []);

    const result = buildShortagesFromVoorraadbeeld(vb);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      reason: "minimum",
      qualityName: "Onbekend",
      colorName: "Onbekend",
      hexColor: null,
      dimensionName: "",
      shortage: 6,
    });
  });
});
