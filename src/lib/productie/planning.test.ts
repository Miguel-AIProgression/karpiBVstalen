import { describe, it, expect } from "vitest";
import {
  buildShortages,
  computePlan,
  planWeeks,
  PSEUDO_WEEK_NO_DEADLINE,
  stockKey,
  type SampleInfo,
  type ShortageRow,
} from "./planning";

const UTC = (s: string) => new Date(s + "T00:00:00Z");

function sample(
  qid: string,
  cid: string,
  did: string,
  overrides: Partial<SampleInfo> = {},
): SampleInfo {
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

function samplesMap(...infos: SampleInfo[]): ReadonlyMap<string, SampleInfo> {
  const m = new Map<string, SampleInfo>();
  for (const i of infos) m.set(stockKey(i.qualityId, i.colorCodeId, i.dimensionId), i);
  return m;
}

function stockMap(entries: Array<[string, number]>): ReadonlyMap<string, number> {
  return new Map(entries);
}

const TODAY = UTC("2026-04-06"); // Monday, ISO 2026-W15

describe("buildShortages — happy path", () => {
  it("yields one backorder row with deadline = Friday(delivery − 7d)", () => {
    const k = stockKey("q", "c", "d");
    const result = buildShortages({
      orders: [{ deliveryDate: "2026-05-01", lines: [{ sampleKeys: [k], quantity: 5 }] }],
      finishedStock: stockMap([[k, 2]]),
      samples: samplesMap(sample("q", "c", "d")),
      today: TODAY,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      reason: "backorder",
      needed: 5,
      finished: 2,
      shortage: 3,
      deadline: "2026-04-24",
    });
  });
});

describe("buildShortages — multi-quality bundle", () => {
  it("yields two shortage rows, one per sample key", () => {
    const k1 = stockKey("q1", "c1", "d");
    const k2 = stockKey("q2", "c2", "d");
    const result = buildShortages({
      orders: [{ deliveryDate: "2026-05-01", lines: [{ sampleKeys: [k1, k2], quantity: 3 }] }],
      finishedStock: stockMap([]),
      samples: samplesMap(sample("q1", "c1", "d"), sample("q2", "c2", "d")),
      today: TODAY,
    });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.reason === "backorder" && r.shortage === 3)).toBe(true);
  });
});

describe("buildShortages — minimum-stock only", () => {
  it("yields one minimum-row, no deadline", () => {
    const result = buildShortages({
      orders: [],
      finishedStock: stockMap([[stockKey("q", "c", "d"), 4]]),
      samples: samplesMap(sample("q", "c", "d", { minStock: 10 })),
      today: TODAY,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      reason: "minimum",
      needed: 10,
      finished: 4,
      shortage: 6,
      deadline: null,
    });
  });
});

describe("buildShortages — earliest deadline wins", () => {
  it("when two orders use same sample, deadline = earliest", () => {
    const k = stockKey("q", "c", "d");
    const result = buildShortages({
      orders: [
        { deliveryDate: "2026-06-15", lines: [{ sampleKeys: [k], quantity: 2 }] },
        { deliveryDate: "2026-05-01", lines: [{ sampleKeys: [k], quantity: 3 }] },
      ],
      finishedStock: stockMap([]),
      samples: samplesMap(sample("q", "c", "d")),
      today: TODAY,
    });
    expect(result).toHaveLength(1);
    expect(result[0].needed).toBe(5);
    expect(result[0].deadline).toBe("2026-04-24"); // Friday of week containing 2026-05-01 − 7d
  });
});

describe("buildShortages — bug fix: no double-counting min-stock against backorder", () => {
  // Same sample: order needs 10, finished = 2, min_stock = 3.
  // Old code: backorder shortage = 8 AND minimum shortage = 11. Total = 19.
  // Correct:  backorder shortage = 8 AND minimum shortage = 3 (the min_stock buffer).
  it("minimum-row never exceeds min_stock when backorder fully consumes finished", () => {
    const k = stockKey("q", "c", "d");
    const result = buildShortages({
      orders: [{ deliveryDate: "2026-05-01", lines: [{ sampleKeys: [k], quantity: 10 }] }],
      finishedStock: stockMap([[k, 2]]),
      samples: samplesMap(sample("q", "c", "d", { minStock: 3 })),
      today: TODAY,
    });
    const backorder = result.find((r) => r.reason === "backorder");
    const minimum = result.find((r) => r.reason === "minimum");
    expect(backorder?.shortage).toBe(8);
    expect(minimum?.shortage).toBe(3);
  });
});

describe("planWeeks — capacity overflow & cumulative invariants", () => {
  function backorderRow(deadline: string, shortage: number, key = "q|c|d"): ShortageRow {
    const [q, c, d] = key.split("|");
    return {
      quality_id: q,
      color_code_id: c,
      dimension_id: d,
      qualityName: "",
      colorName: "",
      hexColor: null,
      dimensionName: "",
      needed: shortage,
      finished: 0,
      shortage,
      reason: "backorder",
      deadline,
    };
  }

  it("flags later weeks as behind schedule when cum demand outpaces cum capacity", () => {
    const rows = [
      backorderRow("2026-04-10", 60, "q1|c|d"),
      backorderRow("2026-04-17", 60, "q2|c|d"),
      backorderRow("2026-04-24", 60, "q3|c|d"),
    ];
    const wp = planWeeks(rows, 50, TODAY);
    expect(wp).toHaveLength(3);
    expect(wp.map((w) => w.surplus)).toEqual([-10, -20, -30]);
    expect(wp.every((w) => w.cumNeeded > 0)).toBe(true);
  });

  it("cumNeeded is monotonically non-decreasing", () => {
    const rows = [
      backorderRow("2026-04-10", 10, "a|c|d"),
      backorderRow("2026-04-17", 5, "b|c|d"),
      backorderRow("2026-04-24", 8, "e|c|d"),
    ];
    const wp = planWeeks(rows, 100, TODAY);
    for (let i = 1; i < wp.length; i++) expect(wp[i].cumNeeded).toBeGreaterThanOrEqual(wp[i - 1].cumNeeded);
  });

  it("conservation: sum(weekPlan.needed) == sum(shortages.shortage)", () => {
    const rows: ShortageRow[] = [
      backorderRow("2026-04-10", 7, "a|c|d"),
      backorderRow("2026-04-17", 13, "b|c|d"),
      {
        quality_id: "x",
        color_code_id: "y",
        dimension_id: "z",
        qualityName: "",
        colorName: "",
        hexColor: null,
        dimensionName: "",
        needed: 5,
        finished: 0,
        shortage: 5,
        reason: "minimum",
        deadline: null,
      },
    ];
    const wp = planWeeks(rows, 50, TODAY);
    const sumPlan = wp.reduce((s, w) => s + w.needed, 0);
    const sumRows = rows.reduce((s, r) => s + r.shortage, 0);
    expect(sumPlan).toBe(sumRows);
  });

  it("appends a 9999-pseudo-week for minimum-stock rows", () => {
    const rows: ShortageRow[] = [
      {
        quality_id: "x",
        color_code_id: "y",
        dimension_id: "z",
        qualityName: "",
        colorName: "",
        hexColor: null,
        dimensionName: "",
        needed: 10,
        finished: 4,
        shortage: 6,
        reason: "minimum",
        deadline: null,
      },
    ];
    const wp = planWeeks(rows, 50, TODAY);
    expect(wp).toHaveLength(1);
    expect(wp[0].weekNr).toBe(PSEUDO_WEEK_NO_DEADLINE);
    expect(wp[0].weekLabel).toBe("Geen deadline");
  });
});

describe("planWeeks — bug fix: ISO year boundary", () => {
  it("week 1 of next year still gets a positive cumCapacity", () => {
    // today = ISO 2025-W51 (Monday 2025-12-15)
    const today = UTC("2025-12-15");
    const rows: ShortageRow[] = [
      {
        quality_id: "q",
        color_code_id: "c",
        dimension_id: "d",
        qualityName: "",
        colorName: "",
        hexColor: null,
        dimensionName: "",
        needed: 10,
        finished: 0,
        shortage: 10,
        reason: "backorder",
        deadline: "2026-01-09", // Friday of ISO 2026-W2
      },
    ];
    const wp = planWeeks(rows, 5, today);
    expect(wp).toHaveLength(1);
    // Old buggy code: weeksFromNow = max(1, 2 - 51 + 1) = 1, cumCapacity = 5.
    // Correct: weeksBetween(2025-12-15, 2026-01-09) = 3 weeks ahead → weeksFromNow = 4, cumCapacity = 20.
    expect(wp[0].cumCapacity).toBe(20);
    expect(wp[0].surplus).toBe(10);
  });
});

describe("computePlan — orchestrator + totals", () => {
  it("totals.behindSchedule is true when any weekPlan surplus is negative", () => {
    const k = stockKey("q", "c", "d");
    const result = computePlan({
      orders: [{ deliveryDate: "2026-04-13", lines: [{ sampleKeys: [k], quantity: 100 }] }],
      finishedStock: stockMap([]),
      samples: samplesMap(sample("q", "c", "d")),
      weeklyCapacity: 5,
      today: TODAY,
    });
    expect(result.totals.behindSchedule).toBe(true);
    expect(result.totals.shortageQty).toBe(100);
    expect(result.totals.weeksNeeded).toBe(20);
  });

  it("totals.shortageQty matches sum of shortages.shortage", () => {
    const k = stockKey("q", "c", "d");
    const result = computePlan({
      orders: [{ deliveryDate: "2026-05-01", lines: [{ sampleKeys: [k], quantity: 5 }] }],
      finishedStock: stockMap([[k, 1]]),
      samples: samplesMap(sample("q", "c", "d", { minStock: 2 })),
      weeklyCapacity: 50,
      today: TODAY,
    });
    const sum = result.shortages.reduce((s, r) => s + r.shortage, 0);
    expect(result.totals.shortageQty).toBe(sum);
  });
});

describe("buildShortages — orders without delivery date", () => {
  it("counts demand but yields no deadline → ends up in pseudo-week", () => {
    const k = stockKey("q", "c", "d");
    const result = buildShortages({
      orders: [{ deliveryDate: null, lines: [{ sampleKeys: [k], quantity: 5 }] }],
      finishedStock: stockMap([]),
      samples: samplesMap(sample("q", "c", "d")),
      today: TODAY,
    });
    expect(result).toHaveLength(1);
    expect(result[0].deadline).toBeNull();
    const wp = planWeeks(result, 50, TODAY);
    expect(wp).toHaveLength(1);
    expect(wp[0].weekNr).toBe(PSEUDO_WEEK_NO_DEADLINE);
  });
});
