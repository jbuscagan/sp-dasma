// Keeps encoded / pasted values in one consistent format.
import { norm } from '@/features/scan/extract';

/** PH mobile numbers → 09XXXXXXXXX (accepts +63 917…, 63917…, 917…, 0917-…). Other numbers: digits only. */
export function formatPhone(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const d = s.replace(/\D/g, '');
  if (/^639\d{9}$/.test(d)) return '0' + d.slice(2);
  if (/^9\d{9}$/.test(d)) return '0' + d;
  if (/^09\d{9}$/.test(d)) return d;
  return d || s; // landline or incomplete: keep the digits
}

export const isMobile = (s: string | null | undefined) => /^09\d{9}$/.test(formatPhone(s));

/** Spelling from the official list when it matches ("brgy. salitran 2" → "Salitran II"); otherwise trimmed. */
export function canonical(value: string | null | undefined, list: string[]): string {
  const v = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!v) return '';
  const n = norm(v.replace(/^(brgy\.?|barangay)\s+/i, '')).trim();
  return list.find((x) => norm(x).trim() === n) ?? v;
}

/** Collapses spaces; turns ALL-CAPS names into Title Case (JUAN DELA CRUZ → Juan Dela Cruz). */
export function formatName(raw: string | null | undefined): string {
  const t = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!t || t !== t.toUpperCase() || !/[A-Z]/.test(t)) return t;
  return t
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parts = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
};

/** Date range from the calendar → "December 20, 2026", "December 20–21, 2026", "Nov 30 – Dec 2, 2026". */
export function formatDateRange(from: string, to?: string): string {
  if (!from) return '';
  const a = parts(from);
  if (!to || to <= from) return `${MONTHS[a.m - 1]} ${a.d}, ${a.y}`;
  const b = parts(to);
  if (a.y === b.y && a.m === b.m) return `${MONTHS[a.m - 1]} ${a.d}–${b.d}, ${a.y}`;
  if (a.y === b.y) return `${MONTHS[a.m - 1].slice(0, 3)} ${a.d} – ${MONTHS[b.m - 1].slice(0, 3)} ${b.d}, ${b.y}`;
  return `${MONTHS[a.m - 1].slice(0, 3)} ${a.d}, ${a.y} – ${MONTHS[b.m - 1].slice(0, 3)} ${b.d}, ${b.y}`;
}

/** Reads back "December 20–21, 2026" (or a single date) so the calendar can show it. */
export function parseDateRange(text: string): { from: string; to: string } {
  const t = String(text ?? '').trim();
  const m = t.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:\s*[–-]\s*(?:([A-Za-z]+)\.?\s+)?(\d{1,2}))?,?\s+(\d{4})$/);
  if (!m) return { from: '', to: '' };
  const mi = (name: string) => MONTHS.findIndex((x) => x.toLowerCase().startsWith(name.toLowerCase().slice(0, 3))) + 1;
  const y = Number(m[5]);
  const m1 = mi(m[1]);
  if (!m1) return { from: '', to: '' };
  const iso = (mm: number, dd: number) => `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const from = iso(m1, Number(m[2]));
  const to = m[4] ? iso(m[3] ? mi(m[3]) || m1 : m1, Number(m[4])) : '';
  return { from, to };
}

/** "Office of SPM Robin Cantimbuhan" → "SPM Robin Cantimbuhan" (used for "Received by"). */
export function officeShortName(c: { name: string; spm_name?: string | null } | null | undefined): string {
  if (!c) return '';
  if (c.spm_name?.trim()) return `SPM ${c.spm_name.trim()}`;
  return c.name.replace(/^\s*office\s+of\s+(the\s+)?/i, '').trim() || c.name;
}
