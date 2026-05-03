import { fridayOfIsoWeek, isoWeekParts, weeksBetween } from "@/lib/dates/iso-week";

export type StockKey = string;

export function stockKey(qualityId: string, colorCodeId: string, dimensionId: string): StockKey {
  return `${qualityId}|${colorCodeId}|${dimensionId}`;
}

export interface SampleInfo {
  qualityId: string;
  colorCodeId: string;
  dimensionId: string;
  qualityName: string;
  colorName: string;
  hexColor: string | null;
  dimensionName: string;
  minStock: number;
}

export interface OrderDemand {
  /** YYYY-MM-DD or null when the order has no delivery date */
  deliveryDate: string | null;
  lines: { sampleKeys: StockKey[]; quantity: number }[];
}

export interface ShortageRow {
  quality_id: string;
  color_code_id: string;
  dimension_id: string;
  qualityName: string;
  colorName: string;
  hexColor: string | null;
  dimensionName: string;
  needed: number;
  finished: number;
  shortage: number;
  reason: "backorder" | "minimum";
  /** YYYY-MM-DD = Friday of the ISO week containing (deliveryDate − leadTimeDays). Null for minimum-stock rows. */
  deadline: string | null;
}

export interface WeekPlan {
  weekNr: number;
  weekYear: number;
  weekLabel: string;
  needed: number;
  cumNeeded: number;
  capacity: number;
  cumCapacity: number;
  surplus: number;
  rows: ShortageRow[];
}

export interface PlanningInput {
  orders: OrderDemand[];
  finishedStock: ReadonlyMap<StockKey, number>;
  samples: ReadonlyMap<StockKey, SampleInfo>;
  weeklyCapacity: number;
  /** Injected so callers control determinism — never read `new Date()` here. */
  today: Date;
  /** Days subtracted from delivery_date to derive the production deadline. Default 7. */
  leadTimeDays?: number;
}

export interface PlanningTotals {
  shortageQty: number;
  backorderCount: number;
  minimumCount: number;
  weeksNeeded: number;
  behindSchedule: boolean;
}

export interface PlanningResult {
  shortages: ShortageRow[];
  weekPlan: WeekPlan[];
  totals: PlanningTotals;
}

export const PSEUDO_WEEK_NO_DEADLINE = 9999;

export function computePlan(input: PlanningInput): PlanningResult {
  const shortages = buildShortages(input);
  const weekPlan = planWeeks(shortages, input.weeklyCapacity, input.today);
  const shortageQty = shortages.reduce((s, r) => s + r.shortage, 0);
  const backorderCount = shortages.filter((r) => r.reason === "backorder").length;
  const minimumCount = shortages.filter((r) => r.reason === "minimum").length;
  const weeksNeeded = shortageQty > 0 ? Math.ceil(shortageQty / input.weeklyCapacity) : 0;
  const behindSchedule = weekPlan.some(
    (w) => w.weekNr !== PSEUDO_WEEK_NO_DEADLINE && w.surplus < 0,
  );
  return {
    shortages,
    weekPlan,
    totals: { shortageQty, backorderCount, minimumCount, weeksNeeded, behindSchedule },
  };
}

export function buildShortages(input: Omit<PlanningInput, "weeklyCapacity">): ShortageRow[] {
  const { orders, finishedStock, samples } = input;
  const leadTimeDays = input.leadTimeDays ?? 7;

  const boMap = new Map<StockKey, number>();
  const deadlineMap = new Map<StockKey, string>();

  for (const order of orders) {
    let deadline: string | null = null;
    if (order.deliveryDate) {
      const d = new Date(order.deliveryDate + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - leadTimeDays);
      deadline = fridayOfIsoWeek(d).toISOString().slice(0, 10);
    }
    for (const line of order.lines) {
      for (const k of line.sampleKeys) {
        boMap.set(k, (boMap.get(k) ?? 0) + line.quantity);
        if (deadline) {
          const existing = deadlineMap.get(k);
          if (!existing || deadline < existing) deadlineMap.set(k, deadline);
        }
      }
    }
  }

  const result: ShortageRow[] = [];

  for (const [k, needed] of boMap.entries()) {
    const fin = finishedStock.get(k) ?? 0;
    const shortage = needed - fin;
    if (shortage <= 0) continue;
    const info = samples.get(k);
    const [quality_id, color_code_id, dimension_id] = k.split("|");
    result.push({
      quality_id,
      color_code_id,
      dimension_id,
      qualityName: info?.qualityName ?? "Onbekend",
      colorName: info?.colorName ?? "Onbekend",
      hexColor: info?.hexColor ?? null,
      dimensionName: info?.dimensionName ?? "",
      needed,
      finished: fin,
      shortage,
      reason: "backorder",
      deadline: deadlineMap.get(k) ?? null,
    });
  }

  for (const [k, info] of samples.entries()) {
    if (info.minStock <= 0) continue;
    const fin = finishedStock.get(k) ?? 0;
    const bo = boMap.get(k) ?? 0;
    // Bug fix: stock available *after* orders are filled cannot be negative.
    // The previous formula `vrij = fin - bo` allowed negative values, which
    // caused minimum-row shortages to silently include backorder demand —
    // double-counting against the backorder row for the same sample.
    const vrij = Math.max(0, fin - bo);
    const shortage = info.minStock - vrij;
    if (shortage <= 0) continue;
    result.push({
      quality_id: info.qualityId,
      color_code_id: info.colorCodeId,
      dimension_id: info.dimensionId,
      qualityName: info.qualityName,
      colorName: info.colorName,
      hexColor: info.hexColor,
      dimensionName: info.dimensionName,
      needed: info.minStock,
      finished: fin,
      shortage,
      reason: "minimum",
      deadline: null,
    });
  }

  return result;
}

export function planWeeks(rows: ShortageRow[], weeklyCapacity: number, today: Date): WeekPlan[] {
  const backorderRows = rows.filter((r) => r.reason === "backorder" && r.deadline);
  const minimumRows = rows.filter((r) => r.reason === "minimum" || !r.deadline);

  type Bucket = { rows: ShortageRow[]; firstDate: Date; year: number; week: number };
  const buckets = new Map<number, Bucket>();

  for (const row of backorderRows) {
    const dl = new Date(row.deadline! + "T00:00:00Z");
    const { week, year } = isoWeekParts(dl);
    const key = year * 100 + week;
    const bucket = buckets.get(key);
    if (bucket) bucket.rows.push(row);
    else buckets.set(key, { rows: [row], firstDate: dl, year, week });
  }

  const sorted = [...buckets.values()].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.week - b.week,
  );

  const result: WeekPlan[] = [];
  let cumNeeded = 0;
  let cumCapacity = 0;

  for (const bucket of sorted) {
    const needed = bucket.rows.reduce((s, r) => s + r.shortage, 0);
    cumNeeded += needed;
    // Bug fix: previously `Math.max(1, wk - currentWeek + 1)`, which became
    // negative across the ISO year boundary (week 51 → week 2 of next year
    // gave a diff of −49). weeksBetween() handles year boundaries correctly.
    const weeksFromNow = Math.max(1, weeksBetween(today, bucket.firstDate) + 1);
    cumCapacity = weeksFromNow * weeklyCapacity;
    const fri = fridayOfIsoWeek(bucket.firstDate);
    const weekLabel = `Wk ${bucket.week} — ${fri.toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    })}`;
    result.push({
      weekNr: bucket.week,
      weekYear: bucket.year,
      weekLabel,
      needed,
      cumNeeded,
      capacity: weeklyCapacity,
      cumCapacity,
      surplus: cumCapacity - cumNeeded,
      rows: bucket.rows,
    });
  }

  const totalMinShortage = minimumRows.reduce((s, r) => s + r.shortage, 0);
  if (totalMinShortage > 0) {
    cumNeeded += totalMinShortage;
    cumCapacity += weeklyCapacity;
    result.push({
      weekNr: PSEUDO_WEEK_NO_DEADLINE,
      weekYear: PSEUDO_WEEK_NO_DEADLINE,
      weekLabel: "Geen deadline",
      needed: totalMinShortage,
      cumNeeded,
      capacity: weeklyCapacity,
      cumCapacity,
      surplus: cumCapacity - cumNeeded,
      rows: minimumRows,
    });
  }

  return result;
}
