/**
 * ISO 8601 week helpers. All operations in UTC for determinism;
 * mixing UTC and local time across helpers caused day-shifts at
 * midnight/DST boundaries in the previous in-line implementations.
 */

export interface IsoWeekParts {
  week: number;
  year: number;
}

export function isoWeek(date: Date): number {
  return isoWeekParts(date).week;
}

export function isoWeekYear(date: Date): number {
  return isoWeekParts(date).year;
}

export function isoWeekParts(date: Date): IsoWeekParts {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

export function mondayOfIsoWeek(year: number, week: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

export function fridayOfIsoWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + (5 - day));
  return d;
}

export function weeksBetween(from: Date, to: Date): number {
  const a = isoWeekParts(from);
  const b = isoWeekParts(to);
  if (a.year === b.year) return b.week - a.week;
  const aMonday = new Date(mondayOfIsoWeek(a.year, a.week) + "T00:00:00Z");
  const bMonday = new Date(mondayOfIsoWeek(b.year, b.week) + "T00:00:00Z");
  return Math.round((bMonday.getTime() - aMonday.getTime()) / (7 * 86400000));
}
