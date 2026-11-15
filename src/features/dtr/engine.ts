// ============================================================================
// DTR ENGINE — ported from the Google Apps Script "DTR AUTOMATION — FLEXIBLE VERSION".
// Pure functions only (no database, no UI) so it can be unit-tested.
// Times are minutes after midnight; dates are 'yyyy-MM-dd' text.
// ============================================================================
import { daysBetween, eachIso, iso, weekdayOf } from '@/lib/dates';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MAX_RANGE_DAYS = 100;

export type DayType = 'NORMAL' | 'WORK' | 'HALF_AM' | 'HALF_PM' | 'CUSTOM' | 'HOLIDAY';

export const TYPE_LABELS: Record<DayType, string> = {
  NORMAL: 'Normal',
  WORK: 'Extra work day',
  HALF_AM: 'Half day (morning)',
  HALF_PM: 'Half day (afternoon)',
  CUSTOM: 'Exact times',
  HOLIDAY: 'Holiday / leave (no times)',
};

/** One weekday rule, stored as the same friendly text the RULES sheet used. */
export interface RuleText {
  day: number; // 0 = Sunday
  works: boolean;
  amIn: string; // '7:30-7:55'
  amOut: string; // '11:15-12:30'
  lunch: string; // '30-45' (minutes)
  pmOut: string; // '18:30-18:40'
}

export interface DtrSettings {
  // ---- page ----
  layout: 'sheet3' | 'single'; // sheet3 = 3 forms on A4 landscape (plain paper); single = 1 form per page (pre-printed forms)
  printBackground: boolean; // print the scanned form itself (for plain paper)
  sheetMarginX: number; // mm from the left edge of the A4 sheet to the first form
  sheetMarginY: number; // mm from the top edge
  sheetGap: number; // mm between forms (cutting space)
  // ---- one form ----
  formW: number; // mm, width of ONE form
  formH: number;
  offsetL: number; // single layout only: where the form starts on the page
  offsetT: number;
  xShift: number; // fine tuning after a test print
  yShift: number;
  timeYShift: number; // times only
  timeFont: number;
  headFont: number;
  halfAmOut: string; // '11:30-12:05'
  halfPmIn: string; // '13:00-13:15'
  // ---- signature area (bottom of each form): SPM on the left, employee on the right, level with each other ----
  signatoryName: string; // ROBIN CHESTER J. CANTIMBUHAN
  signatoryTitle: string; // Sangguniang Panlungsod Member
  signatoryPath: string; // e-signature image in storage ("signatures" bucket)
  signatoryShow: boolean;
  employeeNameShow: boolean;
  footerNameFont: number; // max size of both printed names; long names shrink to fit
  footerLabelFont: number; // "Employee's signature" / title under the line
  footerSigMaxH: number; // max height of each e-signature (mm); never covers "I hereby certify…"
  footerYShift: number; // mm, moves the whole signature area (+ down / − up)
}

export const DEFAULT_RULES: RuleText[] = [
  { day: 1, works: true, amIn: '6:30-6:59', amOut: '11:15-12:30', lunch: '30-45', pmOut: '18:30-18:40' },
  { day: 2, works: true, amIn: '7:30-7:55', amOut: '11:15-12:30', lunch: '30-45', pmOut: '18:30-18:40' },
  { day: 3, works: true, amIn: '7:30-7:55', amOut: '11:15-12:30', lunch: '30-45', pmOut: '18:30-18:40' },
  { day: 4, works: true, amIn: '7:30-7:55', amOut: '11:15-12:30', lunch: '30-45', pmOut: '18:30-18:40' },
  { day: 5, works: false, amIn: '7:30-7:55', amOut: '11:15-12:30', lunch: '30-45', pmOut: '18:30-18:40' },
  { day: 6, works: false, amIn: '7:30-7:55', amOut: '11:15-12:30', lunch: '30-45', pmOut: '18:30-18:40' },
  { day: 0, works: false, amIn: '7:30-7:55', amOut: '11:15-12:30', lunch: '30-45', pmOut: '18:30-18:40' },
];

export const DEFAULT_SETTINGS: DtrSettings = {
  layout: 'sheet3',
  printBackground: true,
  sheetMarginX: 7.3,
  sheetMarginY: 9.5,
  sheetGap: 1,
  formW: 94.2,
  formH: 191,
  offsetL: 0,
  offsetT: 0,
  xShift: 0,
  yShift: 0,
  timeYShift: 0,
  timeFont: 8,
  headFont: 8,
  halfAmOut: '11:30-12:05',
  halfPmIn: '13:00-13:15',
  signatoryName: '',
  signatoryTitle: 'Sangguniang Panlungsod Member',
  signatoryPath: '',
  signatoryShow: true,
  employeeNameShow: true,
  footerNameFont: 7.5,
  footerLabelFont: 5.5,
  footerSigMaxH: 9,
  footerYShift: 0,
};

// ---------------------------------------------------------------- time text

export function parseTime(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const m = String(value).trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([AaPp])?\.?[Mm]?\.?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (m[3]) hour = (hour % 12) + (/p/i.test(m[3]) ? 12 : 0);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** '7:30-7:55' -> [450, 475].  With asTime=false, '30-45' -> [30, 45]. */
export function parseRange(value: unknown, asTime: boolean): [number, number] | null {
  const parts = String(value ?? '')
    .trim()
    .split(/\s*(?:-|–|—|\bto\b)\s*/i)
    .filter((p) => p !== '');
  if (parts.length === 1) parts.push(parts[0]);
  if (parts.length !== 2) return null;
  const a = asTime ? parseTime(parts[0]) : Number(parts[0]);
  const b = asTime ? parseTime(parts[1]) : Number(parts[1]);
  if (a === null || b === null || isNaN(a) || isNaN(b)) return null;
  return [Math.min(a, b), Math.max(a, b)];
}

/** Stored as 24-hour text, e.g. 07:45 or 18:35. */
export function minToText(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
}

/** Printed on the form as h:mm (no AM/PM), e.g. 7:45 or 6:35. */
export function minToPrint(minutes: number): string {
  const h = Math.floor(minutes / 60) % 12 || 12;
  const m = minutes % 60;
  return `${h}:${m < 10 ? '0' : ''}${m}`;
}

// ---------------------------------------------------------------- rules

interface Rule {
  works: boolean;
  amIn: [number, number];
  amOut: [number, number];
  lunch: [number, number];
  pmOut: [number, number];
}

export function compileRules(list: RuleText[]): Record<number, Rule> {
  const rules: Record<number, Rule> = {};
  list.forEach((r) => {
    const parsed = {
      works: r.works,
      amIn: parseRange(r.amIn, true),
      amOut: parseRange(r.amOut, true),
      lunch: parseRange(r.lunch, false),
      pmOut: parseRange(r.pmOut, true),
    };
    (['amIn', 'amOut', 'lunch', 'pmOut'] as const).forEach((f) => {
      if (!parsed[f]) {
        throw new Error(`${DAY_NAMES[r.day]}: "${f}" must look like 7:30-7:55 (lunch like 30-45).`);
      }
    });
    rules[r.day] = parsed as Rule;
  });
  for (let d = 0; d <= 6; d++) if (!rules[d]) throw new Error(`Rules are missing ${DAY_NAMES[d]}.`);
  return rules;
}

// ---------------------------------------------------------------- generation

export interface Override {
  from: string;
  to?: string;
  who: 'ALL' | string[]; // employee ids
  type: DayType;
  amIn?: string;
  amOut?: string;
  pmIn?: string;
  pmOut?: string;
  note?: string;
}

export interface GeneratePayload {
  start: string;
  end: string;
  employeeIds: string[];
  workdays: number[]; // 0 = Sunday … 6 = Saturday
  overrides: Override[];
}

export interface AttendanceRow {
  employee_id: string;
  work_date: string;
  am_in: string;
  am_out: string;
  pm_in: string;
  pm_out: string;
  day_type: DayType;
  note: string;
}

interface Rec { amIn: number | null; amOut: number | null; pmIn: number | null; pmOut: number | null }

export type Rng = () => number;
const randomInt = (rng: Rng, [min, max]: [number, number]) => Math.floor(rng() * (max - min + 1)) + min;

export function checkRange(start: string, end: string) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(start || '') || !re.test(end || '')) throw new Error('Pick a start date and an end date.');
  if (start > end) throw new Error('Start date is after the end date.');
  const days = daysBetween(start, end);
  if (days > MAX_RANGE_DAYS) throw new Error(`That range is ${days} days. Maximum is ${MAX_RANGE_DAYS}.`);
}

export function buildRecord(
  type: DayType,
  weekday: number,
  override: Override | null,
  rules: Record<number, Rule>,
  settings: DtrSettings,
  rng: Rng = Math.random,
): Rec {
  const rule = rules[weekday];
  const given = {
    amIn: override ? parseTime(override.amIn) : null,
    amOut: override ? parseTime(override.amOut) : null,
    pmIn: override ? parseTime(override.pmIn) : null,
    pmOut: override ? parseTime(override.pmOut) : null,
  };
  const pick = (r: [number, number]) => randomInt(rng, r);
  const halfAmOut = parseRange(settings.halfAmOut, true) ?? [690, 725];
  const halfPmIn = parseRange(settings.halfPmIn, true) ?? [780, 795];
  const rec: Rec = { amIn: null, amOut: null, pmIn: null, pmOut: null };

  switch (type) {
    case 'NORMAL':
    case 'WORK':
      rec.amIn = given.amIn ?? pick(rule.amIn);
      rec.amOut = given.amOut ?? pick(rule.amOut);
      rec.pmIn = given.pmIn ?? rec.amOut + pick(rule.lunch);
      rec.pmOut = given.pmOut ?? pick(rule.pmOut);
      break;
    case 'HALF_AM':
      rec.amIn = given.amIn ?? pick(rule.amIn);
      rec.amOut = given.amOut ?? pick(halfAmOut);
      break;
    case 'HALF_PM':
      rec.pmIn = given.pmIn ?? pick(halfPmIn);
      rec.pmOut = given.pmOut ?? pick(rule.pmOut);
      break;
    case 'CUSTOM':
      Object.assign(rec, given);
      break;
    default:
      throw new Error('Unknown day type: ' + type);
  }
  return rec;
}

/** Later rows win when two special days cover the same date. */
export function findOverride(overrides: Override[], isoDate: string, employeeId: string): Override | null {
  for (let i = overrides.length - 1; i >= 0; i--) {
    const o = overrides[i];
    const to = o.to || o.from;
    if (isoDate < o.from || isoDate > to) continue;
    if (o.who === 'ALL' || o.who.includes(employeeId)) return o;
  }
  return null;
}

export function generateAttendance(
  p: GeneratePayload,
  ruleText: RuleText[],
  settings: DtrSettings,
  names: Record<string, string>,
  rng: Rng = Math.random,
) {
  checkRange(p.start, p.end);
  if (!p.employeeIds.length) throw new Error('Select at least one person.');

  const rules = compileRules(ruleText);
  const overrides = p.overrides.filter((o) => o && o.from);
  const workdays = new Set(p.workdays.map(Number));
  const rows: AttendanceRow[] = [];
  const warnings: string[] = [];
  const perPerson: Record<string, number> = {};

  p.employeeIds.forEach((id) => {
    const name = names[id] ?? id;
    perPerson[name] = 0;

    eachIso(p.start, p.end, (day) => {
      const weekday = weekdayOf(day);
      const override = findOverride(overrides, day, id);
      let type: DayType = 'NORMAL';
      let rec: Rec;

      if (override) {
        if (override.type === 'HOLIDAY') return;
        type = override.type;
        rec = buildRecord(type, weekday, override, rules, settings, rng);
      } else if (workdays.has(weekday)) {
        rec = buildRecord('NORMAL', weekday, null, rules, settings, rng);
      } else {
        return;
      }

      const order = [rec.amIn, rec.amOut, rec.pmIn, rec.pmOut].filter((v): v is number => v !== null);
      for (let i = 1; i < order.length; i++) {
        if (order[i] <= order[i - 1]) {
          warnings.push(`${name} – ${day}: times are not in order. Check the attendance table.`);
          break;
        }
      }
      if (!order.length) {
        warnings.push(`${name} – ${day}: no times to print, day skipped.`);
        return;
      }

      rows.push({
        employee_id: id,
        work_date: day,
        am_in: minToText(rec.amIn),
        am_out: minToText(rec.amOut),
        pm_in: minToText(rec.pmIn),
        pm_out: minToText(rec.pmOut),
        day_type: type,
        note: override?.note ?? '',
      });
      perPerson[name]++;
    });
  });

  return { rows, warnings, perPerson };
}

// ---------------------------------------------------------------- forms

export interface DayTimes { amIn: number | null; amOut: number | null; pmIn: number | null; pmOut: number | null }
export interface FormPlan { type: 'A' | 'B'; key: string; days: Record<number, DayTimes> }

/**
 * Splits one person's dates into forms (1-15 = "A", 16-31 = "B" of each month).
 * Order: A, B, A, B … (each kind oldest first) so a whole office prints as
 * 1-15, 16-31, 1-15 | 16-31, 1-15, 16-31 … which stacks and cuts neatly.
 */
export function planForms(days: Record<string, DayTimes>): FormPlan[] {
  const forms: Record<string, FormPlan> = {};
  Object.keys(days)
    .sort()
    .forEach((d) => {
      const dayNo = Number(d.slice(8, 10));
      const type = dayNo <= 15 ? 'A' : 'B';
      const key = `${d.slice(0, 7)}-${type}`;
      forms[key] = forms[key] ?? { type, key, days: {} };
      forms[key].days[dayNo] = days[d];
    });
  const sorted = Object.keys(forms).sort().map((k) => forms[k]);
  const a = sorted.filter((f) => f.type === 'A');
  const b = sorted.filter((f) => f.type === 'B');
  const out: FormPlan[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

/**
 * Slot number for each form when slots strictly alternate A, B, A, B …
 * If the next form does not match the next slot, that slot is left as a blank form.
 */
export function slotIndexes(types: ('A' | 'B')[]): number[] {
  let slot = 0;
  return types.map((t) => {
    if ((slot % 2 === 0 ? 'A' : 'B') !== t) slot++;
    return slot++;
  });
}

// ---------------------------------------------------------------- date presets (same as the planner)

const parts = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
};

export function preset21to5(today: string): [string, string] {
  const t = parts(today);
  return t.d <= 16 ? [iso(t.y, t.m - 1, 21), iso(t.y, t.m, 5)] : [iso(t.y, t.m, 21), iso(t.y, t.m + 1, 5)];
}

export function preset6to20(today: string): [string, string] {
  const t = parts(today);
  const m = t.d >= 6 ? t.m : t.m - 1;
  return [iso(t.y, m, 6), iso(t.y, m, 20)];
}

export function presetAuto(today: string): [string, string] {
  const t = parts(today);
  return t.d >= 17 ? [iso(t.y, t.m, 6), iso(t.y, t.m, 20)] : [iso(t.y, t.m - 1, 21), iso(t.y, t.m, 5)];
}

// ---------------------------------------------------------------- cut-offs (Records / Planner)

export type Cutoff = 'first' | 'second' | 'month';
export const CUTOFF_LABELS: Record<Cutoff, string> = { first: '1st cut-off (1–15)', second: '2nd cut-off (16–end)', month: 'Whole month' };

/** month = 'yyyy-MM'. 1st cut-off = days 1–15, 2nd = 16 to the last day of the month. */
export function cutoffRange(month: string, cutoff: Cutoff): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = (n: number) => `${y}-${String(m).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
  if (cutoff === 'first') return [d(1), d(15)];
  if (cutoff === 'second') return [d(16), d(last)];
  return [d(1), d(last)];
}

/** The cut-off that contains today's date. */
export function currentCutoff(today: string): { month: string; cutoff: Cutoff } {
  return { month: today.slice(0, 7), cutoff: Number(today.slice(8, 10)) <= 15 ? 'first' : 'second' };
}
