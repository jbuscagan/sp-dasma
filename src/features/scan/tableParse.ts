// Reads the table of an already-prepared transmittal PDF (one that has real text, e.g. exported from
// Google Docs, Word or this system) and turns every row into request fields. No OCR needed.
import type { Entry } from '@/lib/types';
import { norm } from './extract';

export interface TextItem {
  str: string;
  x: number; // left, in PDF points
  y: number; // baseline, measured from the TOP of the page (bigger = lower)
  w: number;
}

type Field = keyof Pick<
  Entry,
  'date_received' | 'solicitor_name' | 'patient_name' | 'organization' | 'barangay' | 'purpose' | 'request' | 'contact_number' | 'event_date' | 'diagnosis' | 'assistance_spec' | 'remarks'
>;

export type ParsedRow = Partial<Record<Field, string>> & { orgBarangay?: string };

/** Header words → field. Order matters: more specific labels first. */
const LABELS: [RegExp, Field | 'orgBarangay' | 'number'][] = [
  [/^#$|^no\.?$/i, 'number'],
  [/date\s*received/i, 'date_received'],
  [/date\s*(of)?\s*event|^date$/i, 'event_date'],
  [/organi[sz]ation|association|barangay\s*\//i, 'orgBarangay'],
  [/patient|solicitor|requestor|^name/i, 'solicitor_name'],
  [/^barangay$/i, 'barangay'],
  [/^dx$|diagnos/i, 'diagnosis'],
  [/assistance\s*specif/i, 'assistance_spec'],
  [/purpose|activity|reason/i, 'purpose'],
  [/request/i, 'request'],
  [/contact/i, 'contact_number'],
  [/remarks/i, 'remarks'],
];

const clean = (s: string) => s.replace(/[​­]/g, '').replace(/\s+/g, ' ').trim();

/** Groups items into lines (same baseline ± tolerance). */
function lines(items: TextItem[], tol = 2.5) {
  const sorted = [...items].filter((i) => clean(i.str)).sort((a, b) => a.y - b.y || a.x - b.x);
  const out: TextItem[][] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= tol) last.push(it);
    else out.push([it]);
  }
  return out;
}

export interface Columns {
  cols: { label: string; field: Field | 'orgBarangay' | 'number' | null; center: number; from: number; to: number }[];
  headerBottom: number;
}

/** Finds the header row(s) and returns the column boundaries with their field. */
function findColumns(items: TextItem[]): Columns | null {
  const ls = lines(items);
  for (let i = 0; i < ls.length; i++) {
    // a header band may wrap over 2–3 lines ("DATE" / "RECEIVED"); wrapped label lines are close
    // together and contain no digits (a line with numbers is already the first data row)
    const bandLines = [ls[i]];
    for (const next of ls.slice(i + 1, i + 3)) {
      const prev = bandLines[bandLines.length - 1];
      if (next[0].y - prev[0].y > 14 || next.some((it) => /\d/.test(it.str))) break;
      bandLines.push(next);
    }
    const band = bandLines.flat();
    const text = band.map((b) => clean(b.str)).join(' ').toLowerCase();
    const hits = ['received', 'name', 'contact', 'barangay', 'request', 'purpose', 'organization', 'dx'].filter((w) => text.includes(w)).length;
    if (hits < 3) continue;
    // cluster header words by x (words of one label overlap horizontally)
    const words = band.sort((a, b) => a.x - b.x);
    const clusters: { x0: number; x1: number; parts: TextItem[] }[] = [];
    for (const wd of words) {
      const c = clusters.find((k) => wd.x <= k.x1 + 6 && wd.x + wd.w >= k.x0 - 6);
      if (c) {
        c.x0 = Math.min(c.x0, wd.x);
        c.x1 = Math.max(c.x1, wd.x + wd.w);
        c.parts.push(wd);
      } else clusters.push({ x0: wd.x, x1: wd.x + wd.w, parts: [wd] });
    }
    clusters.sort((a, b) => a.x0 - b.x0);
    const cols = clusters.map((c) => {
      const label = c.parts.sort((a, b) => a.y - b.y || a.x - b.x).map((p) => clean(p.str)).join(' ');
      const field = LABELS.find(([re]) => re.test(label))?.[1] ?? null;
      return { label, field, center: (c.x0 + c.x1) / 2 };
    });
    const bottom = Math.max(...band.map((b) => b.y));
    // boundaries halfway between label centres
    const bounds = cols.map((c, k) => ({
      ...c,
      from: k === 0 ? -Infinity : (cols[k - 1].center + c.center) / 2,
      to: k === cols.length - 1 ? Infinity : (c.center + cols[k + 1].center) / 2,
    }));
    return { cols: bounds, headerBottom: bottom };
  }
  return null;
}

/** One page of a prepared transmittal → rows (empty if the page has no recognizable table). */
export function parseTransmittalPage(items: TextItem[]): ParsedRow[] {
  return parseTablePage(items).rows;
}

/**
 * Like parseTransmittalPage, but also returns the columns it used. Pages 2, 3 … of a long list often
 * do not repeat the column titles: pass the previous page's columns as `carry` to read them too.
 */
export function parseTablePage(items: TextItem[], carry?: Columns | null): { rows: ParsedRow[]; columns: Columns | null } {
  const own = findColumns(items);
  const found = own ?? (carry ? { cols: carry.cols, headerBottom: -Infinity } : null);
  if (!found) return { rows: [], columns: null };
  const { cols } = found;
  let headerBottom = found.headerBottom;
  const numberCol = cols.find((c) => c.field === 'number');
  const dateCol = cols.find((c) => c.field === 'date_received');
  const body = items.filter((i) => i.y > headerBottom + 1 && clean(i.str));

  // A row starts where the "#" column has a number ("1" or "1.") — or, without a "#" column,
  // where the date-received column has a date.
  const starts = body
    .filter((i) => {
      const cx = i.x + i.w / 2;
      if (numberCol && cx >= numberCol.from && cx < numberCol.to) return /^\d{1,3}\.?$/.test(clean(i.str));
      if (!numberCol && dateCol && cx >= dateCol.from && cx < dateCol.to)
        return /\d{1,2}\/\d{1,2}\/\d{2,4}|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}/i.test(clean(i.str));
      return false;
    })
    .map((i) => i.y)
    .sort((a, b) => a - b)
    .filter((y, k, all) => k === 0 || y - all[k - 1] > 1); // one start per line
  if (!starts.length) return { rows: [], columns: own };
  // continuation page: the table starts half a row above the first number
  if (!own) headerBottom = starts[0] - (starts.length > 1 ? (starts[1] - starts[0]) / 2 : 20) - 1;

  // Each row's text is centred vertically around its number, so split halfway between numbers.
  const rows: ParsedRow[] = [];
  starts.forEach((y, k) => {
    const top = k === 0 ? headerBottom + 1 : (starts[k - 1] + y) / 2;
    const bottom = k === starts.length - 1 ? y + (k ? (y - starts[k - 1]) / 2 : 40) : (y + starts[k + 1]) / 2;
    const cells: Record<string, string[]> = {};
    body
      .filter((i) => i.y > top && i.y <= bottom)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach((i) => {
        const cx = i.x + i.w / 2;
        const col = cols.find((c) => cx >= c.from && cx < c.to);
        if (!col?.field || col.field === 'number') return;
        (cells[col.field] ??= []).push(clean(i.str));
      });
    // join words on the same line with spaces and different lines with " "
    const row: ParsedRow = {};
    Object.entries(cells).forEach(([f, parts]) => ((row as Record<string, string>)[f] = parts.join(' ').replace(/\s+/g, ' ').trim()));
    if (Object.keys(row).length) rows.push(row);
  });

  // "Solicitor: X Patient: Y" (medical) → two fields
  rows.forEach((r) => {
    const n = r.solicitor_name ?? '';
    const sol = n.match(/solicitor\s*:\s*(.+?)(?=patient\s*:|$)/i);
    const pat = n.match(/patient\s*:\s*(.+)$/i);
    if (pat) {
      r.patient_name = pat[1].trim();
      r.solicitor_name = sol ? sol[1].trim() : '';
    }
    // 10/29/2026 → 2026-10-29
    const d = (r.date_received ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (d) r.date_received = `${d[3].length === 2 ? '20' + d[3] : d[3]}-${d[1].padStart(2, '0')}-${d[2].padStart(2, '0')}`;
    if (r.contact_number) r.contact_number = r.contact_number.replace(/[^\d+]/g, '');
  });
  return { rows, columns: own ?? carry ?? null };
}

/**
 * Organization and barangay as two separate values (same rules as the database, see 0010):
 *   "KBDM - Salitran IV", "KBDM (Salitran IV)", "KBDM, Salitran IV", "KBDM of Brgy. Salitran IV" → KBDM + Salitran IV
 *   "Barangay Salitran IV" → no organization, barangay Salitran IV
 * The barangay must be in the official list; otherwise the text stays as the organization.
 */
export function splitOrgBarangay(text: string, barangays: string[]): { organization: string; barangay: string } {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return { organization: '', barangay: '' };
  const find = (x: string) => {
    const k = norm(x.replace(/\b(barangay|brgy|bgy)\b\.?/gi, ' ')).trim();
    return k ? barangays.find((b) => norm(b.replace(/\b(barangay|brgy|bgy)\b\.?/gi, ' ')).trim() === k) : undefined;
  };
  const tidy = (x: string) => x.replace(/^[\s,–—-]+|[\s,–—-]+$/g, '').trim();
  const sep = t.match(/^(.+?)\s*(?:\s[-–—]\s|,|\()\s*([^,()]+?)\)?$/);
  if (sep) {
    const b = find(sep[2]);
    if (b) return { organization: tidy(sep[1]), barangay: b };
  }
  const of = t.match(/^(.+?)\s+(?:(?:of|ng|sa)\s+)?(?:barangay|brgy\.?|bgy\.?)\s+(.+)$/i);
  if (of) {
    const b = find(of[2]);
    if (b) return { organization: tidy(of[1]), barangay: b };
  }
  const whole = find(t);
  return whole ? { organization: '', barangay: whole } : { organization: t, barangay: '' };
}

/**
 * Which kind of transmittal a prepared PDF page is, from its code or title
 * (SPMRC-MA-041 = medical, -BRGY- = barangay, (SK) = SK, -NGO-CH- / Christmas = christmas, -NGO- = CSO/NGO).
 */
export function detectTransmittalType(text: string): 'ngo' | 'christmas' | 'barangay' | 'sk' | 'medical' | 'personal' | null {
  const t = text.replace(/[\u200b\s]+/g, ' ').toUpperCase();
  if (/-MA-\d|MEDICAL ASSISTANCE/.test(t)) return 'medical';
  if (/\(SK\)|– SK\b|- SK\b|-SK-\d/.test(t)) return 'sk';
  if (/-NGO-CH-|CHRISTMAS PARTY\s*$|– CHRISTMAS/.test(t)) return 'christmas';
  if (/-BRGY-\d|REQUESTS? – BARANGAY|REQUESTS? - BARANGAY/.test(t)) return 'barangay';
  if (/-PER-\d|PERSONAL REQUEST/.test(t)) return 'personal';
  if (/-NGO-\d|– NGO|- NGO/.test(t)) return 'ngo';
  return null;
}
