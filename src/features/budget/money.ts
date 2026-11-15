/** ₱26,000 · ₱2,000.50 · - ₱14,000 (negative, like the sample report) */
export function peso(n: number | null | undefined, opts: { blankZero?: boolean } = {}): string {
  if (n === null || n === undefined || isNaN(n)) return '';
  if (opts.blankZero && n === 0) return '';
  const abs = Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${n < 0 ? '- ' : ''}₱${abs}`;
}

/** Reads "₱2,000", "2000.50", "(1,500)", "-14,000" → number; blank → null. */
export function parseMoney(text: string | null | undefined): number | null {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t.replace(/\s/g, ''));
  const n = Number(t.replace(/[₱,\s()PHPphp-]/g, ''));
  if (isNaN(n)) return null;
  return neg ? -n : n;
}
