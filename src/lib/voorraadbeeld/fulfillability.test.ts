import { describe, it, expect } from "vitest";
import { buildFulfillability } from "./fulfillability";
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

describe("buildFulfillability — lege voorraad", () => {
  it("alle orders krijgen status onvolledig en assigned: 0", () => {
    const k = stockKey("q", "c", "d");
    const snapshot = vb({
      finished: [],
      samples: [sampleInfo("q", "c", "d")],
      orders: [
        order("ORD-001", UTC("2026-04-10"), [line("sample-q-c-d", k, 5)]),
        order("ORD-002", UTC("2026-04-11"), [line("sample-q-c-d", k, 3)]),
      ],
    });
    const result = buildFulfillability(snapshot);
    expect(result.size).toBe(2);
    for (const f of result.values()) {
      expect(f.status).toBe("onvolledig");
      expect(f.lines.every((l) => l.assigned === 0)).toBe(true);
    }
  });
});

describe("buildFulfillability — FIFO", () => {
  it("eerdere deliveryDate krijgt eerst bediend (compleet), tweede order onvolledig", () => {
    const k = stockKey("q", "c", "d");
    const snapshot = vb({
      finished: [[k, 5]],
      samples: [sampleInfo("q", "c", "d")],
      orders: [
        order("ORD-A", UTC("2026-04-10"), [line("sample-q-c-d", k, 5)]),
        order("ORD-B", UTC("2026-04-15"), [line("sample-q-c-d", k, 5)]),
      ],
    });
    const result = buildFulfillability(snapshot);
    const a = result.get("order-ORD-A")!;
    const b = result.get("order-ORD-B")!;
    expect(a.status).toBe("compleet");
    expect(a.lines[0].assigned).toBe(5);
    expect(b.status).toBe("onvolledig");
    expect(b.lines[0].assigned).toBe(0);
  });
});

describe("buildFulfillability — tie-breaker op array-volgorde", () => {
  it("bij gelijke deliveryDate respecteert de functie de input-volgorde (read-laag heeft al gesorteerd op orderNumber)", () => {
    const k = stockKey("q", "c", "d");
    const day = UTC("2026-04-10");
    const snapshot = vb({
      finished: [[k, 4]],
      samples: [sampleInfo("q", "c", "d")],
      orders: [
        // De read-laag levert al gesorteerd op orderNumber ASC; we testen
        // dat array-volgorde wint, dus laagste orderNumber eerst.
        order("ORD-100", day, [line("sample-q-c-d", k, 4)]),
        order("ORD-200", day, [line("sample-q-c-d", k, 4)]),
      ],
    });
    const result = buildFulfillability(snapshot);
    expect(result.get("order-ORD-100")!.status).toBe("compleet");
    expect(result.get("order-ORD-100")!.lines[0].assigned).toBe(4);
    expect(result.get("order-ORD-200")!.status).toBe("onvolledig");
    expect(result.get("order-ORD-200")!.lines[0].assigned).toBe(0);
  });
});

describe("buildFulfillability — null deliveryDate", () => {
  it("order zonder leverdatum staat achteraan en krijgt resterende voorraad", () => {
    const k = stockKey("q", "c", "d");
    const snapshot = vb({
      finished: [[k, 7]],
      samples: [sampleInfo("q", "c", "d")],
      orders: [
        // Read-laag sorteert NULLS LAST, dus null-order staat al achteraan.
        order("ORD-1", UTC("2026-04-10"), [line("sample-q-c-d", k, 5)]),
        order("ORD-2", null, [line("sample-q-c-d", k, 5)]),
      ],
    });
    const result = buildFulfillability(snapshot);
    const r1 = result.get("order-ORD-1")!;
    const r2 = result.get("order-ORD-2")!;
    expect(r1.status).toBe("compleet");
    expect(r1.lines[0].assigned).toBe(5);
    expect(r2.status).toBe("onvolledig");
    expect(r2.lines[0].assigned).toBe(2); // 7 - 5 = 2 over
  });
});

describe("buildFulfillability — legacyLineCount > 0 forceert onvolledig", () => {
  it("alle sample-lines compleet maar legacyLineCount > 0 → status onvolledig", () => {
    const k = stockKey("q", "c", "d");
    const snapshot = vb({
      finished: [[k, 10]],
      samples: [sampleInfo("q", "c", "d")],
      orders: [order("ORD-L", UTC("2026-04-10"), [line("sample-q-c-d", k, 3)], 2)],
    });
    const result = buildFulfillability(snapshot);
    const f = result.get("order-ORD-L")!;
    expect(f.legacyLineCount).toBe(2);
    expect(f.lines[0].assigned).toBe(3);
    expect(f.lines[0].needed).toBe(3);
    expect(f.status).toBe("onvolledig");
  });
});

describe("buildFulfillability — binaire status", () => {
  it("één van drie regels onvolledig → status onvolledig; alle drie compleet → compleet", () => {
    const k1 = stockKey("q1", "c", "d");
    const k2 = stockKey("q2", "c", "d");
    const k3 = stockKey("q3", "c", "d");
    const snapshot = vb({
      finished: [
        [k1, 2],
        [k2, 2],
        [k3, 0], // ontbreekt voor order-X
      ],
      samples: [
        sampleInfo("q1", "c", "d"),
        sampleInfo("q2", "c", "d"),
        sampleInfo("q3", "c", "d"),
      ],
      orders: [
        order("ORD-X", UTC("2026-04-10"), [
          line("sample-q1-c-d", k1, 2),
          line("sample-q2-c-d", k2, 2),
          line("sample-q3-c-d", k3, 1),
        ]),
      ],
    });
    const result = buildFulfillability(snapshot);
    const x = result.get("order-ORD-X")!;
    expect(x.status).toBe("onvolledig");
    expect(x.lines.find((l) => l.stockKey === k3)!.assigned).toBe(0);

    // Tweede scenario: alle drie aanwezig → compleet.
    const snapshot2 = vb({
      finished: [
        [k1, 2],
        [k2, 2],
        [k3, 1],
      ],
      samples: [
        sampleInfo("q1", "c", "d"),
        sampleInfo("q2", "c", "d"),
        sampleInfo("q3", "c", "d"),
      ],
      orders: [
        order("ORD-Y", UTC("2026-04-10"), [
          line("sample-q1-c-d", k1, 2),
          line("sample-q2-c-d", k2, 2),
          line("sample-q3-c-d", k3, 1),
        ]),
      ],
    });
    const result2 = buildFulfillability(snapshot2);
    expect(result2.get("order-ORD-Y")!.status).toBe("compleet");
  });
});

describe("buildFulfillability — conservation invariant", () => {
  it("Σ assigned per stockKey ≤ initiële finishedStock per stockKey", () => {
    const k1 = stockKey("q1", "c", "d");
    const k2 = stockKey("q2", "c", "d");
    const initial: ReadonlyArray<[StockKey, number]> = [
      [k1, 6],
      [k2, 4],
    ];
    const snapshot = vb({
      finished: initial,
      samples: [sampleInfo("q1", "c", "d"), sampleInfo("q2", "c", "d")],
      orders: [
        order("ORD-1", UTC("2026-04-10"), [
          line("sample-q1-c-d", k1, 4),
          line("sample-q2-c-d", k2, 2),
        ]),
        order("ORD-2", UTC("2026-04-11"), [
          line("sample-q1-c-d", k1, 5),
          line("sample-q2-c-d", k2, 5),
        ]),
        order("ORD-3", null, [line("sample-q1-c-d", k1, 10)]),
      ],
    });
    const result = buildFulfillability(snapshot);

    const assignedPerKey = new Map<StockKey, number>();
    for (const f of result.values()) {
      for (const l of f.lines) {
        assignedPerKey.set(l.stockKey, (assignedPerKey.get(l.stockKey) ?? 0) + l.assigned);
      }
    }
    for (const [key, init] of initial) {
      expect(assignedPerKey.get(key) ?? 0).toBeLessThanOrEqual(init);
    }
    // Sanity: vb.finishedStock is niet gemuteerd.
    expect(snapshot.finishedStock.get(k1)).toBe(6);
    expect(snapshot.finishedStock.get(k2)).toBe(4);
  });
});
