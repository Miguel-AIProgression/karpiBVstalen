import { describe, it, expect } from "vitest";
import {
  isoWeek,
  isoWeekYear,
  isoWeekParts,
  mondayOfIsoWeek,
  fridayOfIsoWeek,
  weeksBetween,
} from "./iso-week";

const UTC = (s: string) => new Date(s + "T00:00:00Z");

describe("isoWeek", () => {
  it("returns week 1 for 2026-01-01 (Thursday)", () => {
    expect(isoWeek(UTC("2026-01-01"))).toBe(1);
    expect(isoWeekYear(UTC("2026-01-01"))).toBe(2026);
  });

  it("returns week 53 for 2020-12-31 (last week of 2020)", () => {
    expect(isoWeekParts(UTC("2020-12-31"))).toEqual({ week: 53, year: 2020 });
  });

  it("returns week 1/2021 for 2021-01-03 (Sunday before week 1 Monday)", () => {
    expect(isoWeekParts(UTC("2021-01-03"))).toEqual({ week: 53, year: 2020 });
    expect(isoWeekParts(UTC("2021-01-04"))).toEqual({ week: 1, year: 2021 });
  });

  it("matches Wikipedia ISO week reference dates", () => {
    expect(isoWeek(UTC("2025-04-04"))).toBe(14);
    expect(isoWeek(UTC("2025-12-29"))).toBe(1);
    expect(isoWeekYear(UTC("2025-12-29"))).toBe(2026);
  });
});

describe("mondayOfIsoWeek", () => {
  it("returns 2026-01-05 for week 2 of 2026", () => {
    expect(mondayOfIsoWeek(2026, 2)).toBe("2026-01-05");
  });

  it("returns 2024-12-30 for week 1 of 2025 (week starts in previous calendar year)", () => {
    expect(mondayOfIsoWeek(2025, 1)).toBe("2024-12-30");
  });

  it("round-trips with isoWeekParts", () => {
    for (const yw of [
      { year: 2025, week: 14 },
      { year: 2026, week: 1 },
      { year: 2020, week: 53 },
    ]) {
      const monday = mondayOfIsoWeek(yw.year, yw.week);
      expect(isoWeekParts(UTC(monday))).toEqual(yw);
    }
  });
});

describe("fridayOfIsoWeek", () => {
  it("returns Friday for input on Monday", () => {
    expect(fridayOfIsoWeek(UTC("2025-04-07")).toISOString().slice(0, 10)).toBe("2025-04-11");
  });

  it("returns Friday for input on Friday (idempotent)", () => {
    expect(fridayOfIsoWeek(UTC("2025-04-11")).toISOString().slice(0, 10)).toBe("2025-04-11");
  });

  it("returns Friday for input on Sunday (still same ISO week)", () => {
    expect(fridayOfIsoWeek(UTC("2025-04-13")).toISOString().slice(0, 10)).toBe("2025-04-11");
  });

  it("crosses year boundary", () => {
    expect(fridayOfIsoWeek(UTC("2025-12-30")).toISOString().slice(0, 10)).toBe("2026-01-02");
  });
});

describe("weeksBetween", () => {
  it("zero for same week", () => {
    expect(weeksBetween(UTC("2025-04-07"), UTC("2025-04-11"))).toBe(0);
  });

  it("counts forward across year boundary", () => {
    expect(weeksBetween(UTC("2025-12-22"), UTC("2026-01-05"))).toBe(2);
  });

  it("handles ISO 53-week years", () => {
    expect(weeksBetween(UTC("2020-12-21"), UTC("2021-01-04"))).toBe(2);
  });
});
