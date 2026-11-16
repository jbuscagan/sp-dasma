// Spreadsheets (Excel .xlsx or .csv) in "Upload & scan": every row under the column titles becomes
// one request for review. Columns are recognised by their titles (Date received, Name, Organization,
// Barangay, Request, Contact …), the same way as the columns of a transmittal PDF.
import { parseDateText } from '@/lib/dates';
import { headerField, type ParsedRow } from './tableParse';

const HEADER_WORDS = ['received', 'name', 'contact', 'barangay', 'request', 'purpose', 'organization', 'dx', 'solicitor', 'patient', 'event'];

/** Simple CSV reader (quotes, commas and line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim()));
}

/** Rows of text from every sheet of an .xlsx file. */
export async function readXlsx(file: File): Promise<string[][][]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return wb.worksheets.map((ws) => {
    const out: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const cells: string[] = [];
      r.eachCell({ includeEmpty: true }, (c, col) => {
        const v = c.value as unknown;
        cells[col - 1] = v instanceof Date ? v.toISOString().slice(0, 10) : (c.text ?? '').trim();
      });
      out.push(Array.from(cells, (x) => x ?? ''));
    });
    return out;
  });
}

/** Turns the rows of one sheet into request fields (empty when no column titles are found). */
export function rowsToRequests(rows: string[][]): ParsedRow[] {
  const at = rows.findIndex((r) => HEADER_WORDS.filter((w) => r.join(' ').toLowerCase().includes(w)).length >= 3);
  if (at < 0) return [];
  const fields = rows[at].map((h) => headerField(h));
  const out: ParsedRow[] = [];
  for (const r of rows.slice(at + 1)) {
    const row: Record<string, string> = {};
    fields.forEach((f, i) => {
      const v = (r[i] ?? '').trim();
      if (f && f !== 'number' && v) row[f] = row[f] ? `${row[f]} ${v}` : v;
    });
    if (!Object.keys(row).length) continue;
    const parsed = row as ParsedRow;
    const n = parsed.solicitor_name ?? '';
    const pat = n.match(/patient\s*:\s*(.+)$/i);
    if (pat) {
      parsed.patient_name = pat[1].trim();
      parsed.solicitor_name = (n.match(/solicitor\s*:\s*(.+?)(?=patient\s*:|$)/i)?.[1] ?? '').trim();
    }
    if (parsed.date_received) parsed.date_received = parseDateText(parsed.date_received) ?? parsed.date_received;
    if (parsed.contact_number) parsed.contact_number = parsed.contact_number.replace(/[^\d+]/g, '');
    out.push(parsed);
  }
  return out;
}
