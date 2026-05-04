import { describe, it, expect } from "vitest";
import { buildSampleState } from "./sample-state";
import { stockKey } from "@/lib/productie/planning";
import type {
  OrderDemand,
  OrderLineDemand,
  SampleInfo,
  StockKey,
  Voorraadbeeld,
} from "./types";

const UTC = (s: string) => new Date(s + "T00:00:00Z");

const TODAY = UTC("2026-04-06");

function line(sampleId: string, key: StockKey, qty: number): OrderLineDemand {
  return { sampleId, stockKey: key, quantity: qty };
}

function order(
  orderNumber: string,
  deliveryDate: Date | null,
  lines: ReadonlyArray<OrderLineDemand>,
  legacyCount = 0,
): OrderDemand {
  return {
    orderId: `order-${orderNumber}`,
    orderNumber,
    status: "open",
    deliveryDate,
    lines,
    legacyLineCount: legacyCount,
  };
}

function sampleInfo(
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

interface VbFactoryArgs {
  finished: ReadonlyArray<[StockKey, number]>;
  samples: ReadonlyArray<SampleInfo>;
  orders: ReadonlyArray<OrderDemand>;
  today?: Date;
}

function vb({ finished, samples, orders, today = TODAY }: VbFactoryArgs): Voorraadbeeld {
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
    finishedStock: new Map(finished),
    openOrders: orders,
  };
}

describe("buildSampleState — invariant reserved + available = finished", () => {
  it("voor elk sample geldt reserved + available === finished", () => {
    const k1 = stockKey("q1", "c", "d");
    const k2 = stockKey("q2", "c", "d");
    const snapshot = vb({
      finished: [
        [k1, 7],
        [k2, 4],
      ],
      samples: [sampleInfo("q1", "c", "d"), sampleInfo("q2", "c", "d")],
      orders: [
        order("ORD-1", UTC("2026-04-10"), [
          line("sample-q1-c-d", k1, 3),
          line("sample-q2-c-d", k2, 2),
        ]),
        order("ORD-2", UTC("2026-04-11"), [line("sample-q1-c-d", k1, 5)]),
      ],
    });
    const result = buildSampleState(snapshot);
    expect(result.size).toBe(2);
    for (const s of result.values()) {
      expect(s.reserved + s.available).toBe(s.finished);
    }
  });
});

describe("buildSampleState — belowMinimum-flag op de drempel", () => {
  it("available <= minStock ⇒ belowMinimum=true; available > minStock ⇒ false", () => {
    const k = stockKey("q", "c", "d");
    // Sample A: finished=10, reserved=8, minStock=3 → available=2, belowMinimum=true
    const snapshotA = vb({
      finished: [[k, 10]],
      samples: [sampleInfo("q", "c", "d", { minStock: 3 })],
      orders: [order("ORD-A", UTC("2026-04-10"), [line("sample-q-c-d", k, 8)])],
    });
    const a = buildSampleState(snapshotA).get("sample-q-c-d")!;
    expect(a.available).toBe(2);
    expect(a.belowMinimum).toBe(true);

    // Sample B: finished=10, reserved=5, minStock=3 → available=5, belowMinimum=false
    const snapshotB = vb({
      finished: [[k, 10]],
      samples: [sampleInfo("q", "c", "d", { minStock: 3 })],
      orders: [order("ORD-B", UTC("2026-04-10"), [line("sample-q-c-d", k, 5)])],
    });
    const b = buildSampleState(snapshotB).get("sample-q-c-d")!;
    expect(b.available).toBe(5);
    expect(b.belowMinimum).toBe(false);

    // Sample C: finished=6, reserved=3, minStock=3 → available=3, belowMinimum=true (op de drempel)
    const snapshotC = vb({
      finished: [[k, 6]],
      samples: [sampleInfo("q", "c", "d", { minStock: 3 })],
      orders: [order("ORD-C", UTC("2026-04-10"), [line("sample-q-c-d", k, 3)])],
    });
    const c = buildSampleState(snapshotC).get("sample-q-c-d")!;
    expect(c.available).toBe(3);
    expect(c.belowMinimum).toBe(true);
  });
});

describe("buildSampleState — sample zonder open orders", () => {
  it("reserved=0, available=finished, belowMinimum afhankelijk van minStock", () => {
    const kA = stockKey("qa", "c", "d");
    const kB = stockKey("qb", "c", "d");
    const snapshot = vb({
      finished: [
        [kA, 10],
        [kB, 2],
      ],
      samples: [
        sampleInfo("qa", "c", "d", { minStock: 5 }),
        sampleInfo("qb", "c", "d", { minStock: 5 }),
      ],
      orders: [],
    });
    const result = buildSampleState(snapshot);
    const a = result.get("sample-qa-c-d")!;
    expect(a.reserved).toBe(0);
    expect(a.available).toBe(10);
    expect(a.belowMinimum).toBe(false); // 10 > 5
    const b = result.get("sample-qb-c-d")!;
    expect(b.reserved).toBe(0);
    expect(b.available).toBe(2);
    expect(b.belowMinimum).toBe(true); // 2 <= 5
  });
});

describe("buildSampleState — meerdere overlappende orders, FIFO-som", () => {
  it("twee orders à 3 stuks, voorraad=5 → reserved=5 (3 + 2 via FIFO)", () => {
    const k = stockKey("q", "c", "d");
    const snapshot = vb({
      finished: [[k, 5]],
      samples: [sampleInfo("q", "c", "d", { minStock: 1 })],
      orders: [
        order("ORD-1", UTC("2026-04-10"), [line("sample-q-c-d", k, 3)]),
        order("ORD-2", UTC("2026-04-11"), [line("sample-q-c-d", k, 3)]),
      ],
    });
    const s = buildSampleState(snapshot).get("sample-q-c-d")!;
    expect(s.finished).toBe(5);
    expect(s.reserved).toBe(5); // 3 (ORD-1) + 2 (ORD-2 krijgt rest)
    expect(s.available).toBe(0);
    expect(s.belowMinimum).toBe(true); // 0 <= 1
  });
});

describe("buildSampleState — available kan 0 worden zonder error", () => {
  // Edge case: voorraad volledig opgeëist door één order. FIFO garandeert
  // dat assigned ≤ finished, dus available klakkeloos negatief maken kan
  // niet via buildFulfillability. We testen daarom de "exact-op-0"-grens
  // en bevestigen dat belowMinimum afhankelijk blijft van minStock
  // (>= 0 ⇒ true; < 0 zou betekenen dat minStock negatief is, wat we
  // niet ondersteunen).
  it("finished=5, order vraagt 5 → reserved=5, available=0, belowMinimum=true bij minStock=0", () => {
    const k = stockKey("q", "c", "d");
    const snapshot = vb({
      finished: [[k, 5]],
      samples: [sampleInfo("q", "c", "d", { minStock: 0 })],
      orders: [order("ORD-1", UTC("2026-04-10"), [line("sample-q-c-d", k, 5)])],
    });
    const s = buildSampleState(snapshot).get("sample-q-c-d")!;
    expect(s.finished).toBe(5);
    expect(s.reserved).toBe(5);
    expect(s.available).toBe(0);
    expect(s.belowMinimum).toBe(true); // 0 <= 0
  });
});
