import { badRequest } from './errors.js';

export const RANGE_PRESETS = ['7d', '30d', '90d', '1y'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export const INTERVALS = ['day', 'week', 'month'] as const;
export type Interval = (typeof INTERVALS)[number];

export interface DateRange {
  range: RangePreset | 'custom';
  from: Date;
  to: Date;
  interval: Interval;
}

const PRESET_DAYS: Record<RangePreset, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BUCKETS: Record<Interval, number> = { day: 400, week: 270, month: 72 };

function defaultInterval(from: Date, to: Date): Interval {
  const days = (to.getTime() - from.getTime()) / DAY_MS;
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

/**
 * Resolve a reporting period. Explicit from/to win over a preset.
 * Periods are half-open [from, to). A date-only `to` (YYYY-MM-DD) includes that whole day.
 */
export function resolveDateRange(input: {
  range?: RangePreset | undefined;
  from?: string | undefined;
  to?: string | undefined;
  interval?: Interval | undefined;
  defaultRange?: RangePreset;
}): DateRange {
  const now = new Date();
  let result: DateRange;

  if (input.from || input.to) {
    const to = input.to ? parseDateBoundary(input.to, true) : now;
    const from = input.from ? parseDateBoundary(input.from, false) : new Date(to.getTime() - 30 * DAY_MS);
    if (from >= to) throw badRequest('INVALID_DATE_RANGE', '`from` must be earlier than `to`');
    if (to.getTime() - from.getTime() > 5 * 366 * DAY_MS) {
      throw badRequest('INVALID_DATE_RANGE', 'Date range cannot exceed 5 years');
    }
    result = { range: 'custom', from, to, interval: input.interval ?? defaultInterval(from, to) };
  } else {
    const preset = input.range ?? input.defaultRange ?? '30d';
    const from = new Date(now.getTime() - PRESET_DAYS[preset] * DAY_MS);
    result = { range: preset, from, to: now, interval: input.interval ?? defaultInterval(from, now) };
  }

  const approxBuckets = (result.to.getTime() - result.from.getTime()) / DAY_MS / { day: 1, week: 7, month: 30 }[result.interval];
  if (approxBuckets > MAX_BUCKETS[result.interval]) {
    throw badRequest('INVALID_INTERVAL', `Too many ${result.interval} buckets for this range; use a larger interval`);
  }

  return result;
}

/** The equal-length period immediately before `range`. */
export function previousPeriod(range: { from: Date; to: Date }): { from: Date; to: Date } {
  const length = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - length), to: range.from };
}

/** Parse a from/to boundary. A date-only `to` (YYYY-MM-DD) is moved to the start of the next day. */
export function parseDateBoundary(value: string, isEnd: boolean): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) throw badRequest('INVALID_DATE', `Invalid date: ${value}`);
  return dateOnly && isEnd ? new Date(date.getTime() + DAY_MS) : date;
}

/** Percentage change from previous to current, rounded to 2 decimals; null when undefined. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 10000) / 100;
}

export function describeRange(range: DateRange) {
  return {
    range: range.range,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    interval: range.interval,
  };
}
