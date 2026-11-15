// Dates are kept as 'yyyy-MM-dd' text everywhere so time zones can never shift a day.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const pad = (n: number) => (n < 10 ? '0' : '') + n;

export function isoToUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function utcToIso(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Builds an ISO date, rolling months over (month 0 = December of last year). */
export function iso(y: number, m: number, d: number): string {
  return utcToIso(new Date(Date.UTC(y, m - 1, d)));
}

/** Today in the Philippines. */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

export function weekdayOf(isoDate: string): number {
  return isoToUtc(isoDate).getUTCDay();
}

export function eachIso(start: string, end: string, cb: (iso: string) => void) {
  const cur = isoToUtc(start);
  const stop = isoToUtc(end);
  while (cur <= stop) {
    cb(utcToIso(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

export function daysBetween(start: string, end: string): number {
  return (isoToUtc(end).getTime() - isoToUtc(start).getTime()) / 86400000 + 1;
}

/** 10/29/2026 */
export function fmtMDY(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
}

/** 5 NOV 2026 (report header) */
export function fmtHeaderDate(isoDate: string): string {
  const d = isoToUtc(isoDate);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].toUpperCase()} ${d.getUTCFullYear()}`;
}

/** Nov 5, 2026 */
export function fmtLong(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const d = isoToUtc(isoDate.slice(0, 10));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/**
 * Week number used on the transmittal code. Weeks start on Sunday and the days
 * before the first Sunday of the year are week 0 (same as strftime %U).
 * Matches the samples: Oct 15 2026 = 41, Oct 29 = 43, Nov 5 = 44.
 */
export function weekNumber(isoDate: string): number {
  const d = isoToUtc(isoDate);
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.round((d.getTime() - jan1) / 86400000); // 0-based
  return Math.floor((dayOfYear + 7 - d.getUTCDay()) / 7);
}

export function ordinal(n: number): string {
  const s = n % 100;
  if (s >= 11 && s <= 13) return `${n}th`;
  return n + (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
}

/** "Oct 12 to 15" or "Oct 22 to Nov 5" */
export function rangeText(start: string, end: string): string {
  const a = isoToUtc(start);
  const b = isoToUtc(end);
  const left = `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}`;
  if (start === end) return left;
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  return `${left} to ${sameMonth ? b.getUTCDate() : `${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`}`;
}

/** "(44th | Oct 22 to Nov 5)" */
export function coveringText(week: number, start: string, end: string): string {
  return `(${ordinal(week)} | ${rangeText(start, end)})`;
}

const MONTHS_LC = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Accepts 11/04/2026, 2026-11-04, Nov 4, 2026, 4 Nov 2026. Returns yyyy-mm-dd or null. */
export function parseDateText(text: string): string | null {
  const t = text.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  m = t.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (m && MONTHS_LC.includes(m[1].toLowerCase())) return iso(+m[3], MONTHS_LC.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  m = t.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i);
  if (m && MONTHS_LC.includes(m[2].toLowerCase())) return iso(+m[3], MONTHS_LC.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  return null;
}


/** Sunday that starts the week of `day` (weeks start on Sunday, like the report week numbers). */
export function weekStart(day: string = todayIso()): string {
  const d = isoToUtc(day);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return utcToIso(d);
}
