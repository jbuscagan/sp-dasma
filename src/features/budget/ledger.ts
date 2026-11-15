// SP Contribution report ("ledger" layout like the sample): Beginning balance, additions,
// less disbursements (grouped), remaining balance, notes. Rendered to PDF, Word or Excel.
import type { ExportFormat, Orientation, PaperKey } from '@/features/reports/types';
import { PAPERS } from '@/features/reports/types';
import { fmtLong, isoToUtc } from '@/lib/dates';
import { peso } from './money';
import type { ContributionLine, ContributionReport } from './api';

export type LedgerKind = 'head' | 'balance' | 'addition' | 'subtotal' | 'less' | 'group' | 'item' | 'closing';

export interface LedgerRow {
  kind: LedgerKind;
  label: string;
  indent?: boolean;
  mid?: string; // item amount (middle column)
  amount?: string; // running / total amount (right column)
  bold?: boolean;
  ruleAbove?: boolean;
  ruleBelow?: boolean;
}

export interface Ledger {
  title: string;
  dateLine: string;
  rows: LedgerRow[];
  notes: string[];
  filename: string;
}

export function totals(report: Pick<ContributionReport, 'beginning_balance'>, lines: ContributionLine[]) {
  const additions = lines.filter((l) => l.kind === 'addition').reduce((a, l) => a + (l.amount || 0), 0);
  const disbursements = lines.filter((l) => l.kind === 'disbursement').reduce((a, l) => a + (l.amount || 0), 0);
  const available = (report.beginning_balance || 0) + additions;
  return { additions, disbursements, available, remaining: available - disbursements };
}

/** "₱ 23,000" — item amounts in the sample have a space after the peso sign. */
const pesoSpaced = (n: number) => peso(n).replace('₱', '₱ ');

export function buildLedger(report: ContributionReport, lines: ContributionLine[]): Ledger {
  const t = totals(report, lines);
  const adds = lines.filter((l) => l.kind === 'addition');
  const dis = lines.filter((l) => l.kind === 'disbursement');
  const date = isoToUtc(report.report_date);
  const long = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).toUpperCase();

  const rows: LedgerRow[] = [
    { kind: 'head', label: 'DESCRIPTION', amount: 'AMOUNT', bold: true, ruleBelow: true },
    { kind: 'balance', label: 'Beginning Balance', amount: peso(report.beginning_balance), bold: true, ruleBelow: true },
  ];
  adds.forEach((l) => rows.push({ kind: 'addition', label: `Additional: ${l.label}`, amount: peso(l.amount), bold: true, ruleBelow: true }));
  if (adds.length) rows.push({ kind: 'subtotal', label: '', amount: peso(t.available), bold: true });

  if (dis.length) {
    rows.push({ kind: 'less', label: 'Less: Disbursement', bold: true });
    // keep the order of first appearance of each group
    const groups: (string | null)[] = [];
    dis.forEach((l) => !groups.includes(l.grp || null) && groups.push(l.grp || null));
    groups.forEach((g) => {
      const items = dis.filter((l) => (l.grp || null) === g);
      if (g) rows.push({ kind: 'group', label: `${g}:` });
      items.forEach((l) => {
        rows.push({ kind: 'item', label: l.label, indent: !!g, mid: pesoSpaced(l.amount) });
      });
    });
    rows[rows.length - 1].amount = peso(t.disbursements);
  }

  // Like the sample: "Remaining Balance" after an addition, otherwise "Ending Balance".
  const closing = adds.length ? 'Remaining Balance' : 'Ending Balance';
  rows.push({ kind: 'closing', label: `${closing} (${fmtLong(report.report_date)})`, amount: peso(t.remaining), bold: true, ruleAbove: true });

  return {
    title: report.title || 'SP CONTRIBUTION REPORT',
    dateLine: `(${long})`,
    rows,
    notes: (report.notes ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
    filename: `SP_Contribution_${report.report_date}`,
  };
}

const size = (paper: PaperKey, o: Orientation) => {
  const p = PAPERS[paper];
  return o === 'landscape' ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
};

export async function renderLedger(l: Ledger, format: ExportFormat, paper: PaperKey, orientation: Orientation): Promise<Blob> {
  if (format === 'pdf') return ledgerPdf(l, paper, orientation);
  if (format === 'xlsx') return ledgerXlsx(l, paper, orientation);
  return ledgerDocx(l, paper, orientation);
}

/**
 * PDF that follows the sample "SP CONTRIBUTION REPORT" (A4 portrait) measurement for measurement:
 * title 21 pt bold at 32.3 mm, date 16 pt bold at 40.5 mm, body 12 pt, table from 25.4 mm to 184.1 mm,
 * grey 0.75 pt rules, items indented to 46.1 mm, item amounts end at 158.3 mm, totals end at 183.7 mm.
 */
async function ledgerPdf(l: Ledger, paper: PaperKey, orientation: Orientation): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const { addPdfFonts, PDF_FONT: F } = await import('@/lib/pdfFonts');
  const { w, h } = size(paper, orientation);
  const doc = new jsPDF({ unit: 'mm', format: [w, h], orientation });
  await addPdfFonts(doc);

  const left = 25.4; // table edges (1 inch from the left, like the sample)
  const right = w - (210 - 184.1);
  const textLeft = left + 1.9; // labels
  const indent = left + 20.7; // grouped items (CSO, SK, Brgy)
  const ungrouped = left + 5.4; // items without a group (e.g. "Ms. Base")
  const midRight = right - 25.8; // item amounts
  const amtRight = right - 0.4; // totals
  const rule = (y: number) => doc.setDrawColor(153).setLineWidth(0.265).line(left, y, right, y);

  doc.setTextColor(0);
  doc.setFont(F, 'bold').setFontSize(21).text(l.title, w / 2, 32.3, { align: 'center' });
  doc.setFontSize(16).text(l.dateLine, w / 2, 40.5, { align: 'center' });

  let y = 60.7; // baseline of the current row
  let prev: LedgerKind | null = null;
  let lastRule = 0;
  for (const r of l.rows) {
    // vertical spacing between row types, taken from the sample
    if (prev) {
      if (r.kind === 'closing') y = lastRule + 6.2;
      else if (prev === 'head' || prev === 'balance' || prev === 'addition') y = lastRule + (r.kind === 'less' ? 12.8 : 6.1);
      else if (prev === 'subtotal') y += 6.7;
      else if (prev === 'less') y += 7.5;
      else y += 5.6;
    }
    doc.setFont(F, r.bold ? 'bold' : 'normal').setFontSize(12);
    const x = r.kind === 'head' ? left + 2.9 : r.kind === 'item' ? (r.indent ? indent : ungrouped) : r.kind === 'less' ? textLeft + 0.5 : textLeft;
    if (r.label) doc.text(r.label, x, y);
    if (r.mid) doc.setFont(F, 'normal').text(r.mid, midRight, y, { align: 'right' });
    if (r.amount) doc.setFont(F, r.bold ? 'bold' : 'normal').text(r.amount, r.kind === 'head' ? amtRight - 1.3 : amtRight, y, { align: 'right' });
    if (r.ruleBelow) {
      lastRule = y + (r.kind === 'head' ? 3.7 : 2.8);
      rule(lastRule);
    }
    if (r.kind === 'item' || r.kind === 'group') lastRule = y + 3.3; // where the closing rule goes
    prev = r.kind;
  }
  // rule above the closing row
  if (l.rows.some((r) => r.kind === 'closing')) rule(y - 6.2);

  if (l.notes.length) {
    const noteY = y + 24.2;
    doc.setFont(F, 'bold').setFontSize(12).text('Note:', left, noteY);
    l.notes.forEach((n, i) => doc.text(n, left, noteY + 11.2 + i * 5.6));
  }
  return doc.output('blob');
}

async function ledgerXlsx(l: Ledger, paper: PaperKey, orientation: Orientation): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('SP Contribution', {
    pageSetup: { paperSize: PAPERS[paper].excel as never, orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
  });
  ws.columns = [{ width: 6 }, { width: 38 }, { width: 18 }, { width: 18 }];
  const thin = { style: 'thin' as const, color: { argb: 'FF999999' } };
  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = l.title;
  ws.getCell('A1').font = { bold: true, size: 16, name: 'Arial' };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.mergeCells('A2:D2');
  ws.getCell('A2').value = l.dateLine;
  ws.getCell('A2').font = { bold: true, size: 11, name: 'Arial' };
  ws.getCell('A2').alignment = { horizontal: 'center' };
  let y = 4;
  for (const r of l.rows) {
    const row = ws.getRow(y);
    const labelCell = row.getCell(r.indent ? 2 : 1);
    labelCell.value = r.label;
    if (!r.indent) ws.mergeCells(`A${y}:B${y}`);
    row.getCell(3).value = r.mid ?? '';
    row.getCell(4).value = r.amount ?? '';
    [1, 2, 3, 4].forEach((c) => {
      const cell = row.getCell(c);
      cell.font = { bold: !!r.bold, name: 'Arial', size: 10 };
      if (c >= 3) cell.alignment = { horizontal: 'right' };
      cell.border = { ...(r.ruleAbove ? { top: thin } : {}), ...(r.ruleBelow ? { bottom: thin } : {}) };
    });
    y++;
  }
  if (l.notes.length) {
    y += 2;
    ws.getCell(`A${y}`).value = 'Note:';
    ws.getCell(`A${y}`).font = { bold: true, name: 'Arial' };
    l.notes.forEach((n, i) => (ws.getCell(`A${y + 1 + i}`).value = n));
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function ledgerDocx(l: Ledger, paper: PaperKey, orientation: Orientation): Promise<Blob> {
  const d = await import('docx');
  const TW = 56.6929;
  const p = PAPERS[paper];
  const run = (text: string, bold = false, size = 20) => new d.TextRun({ text, bold, size, font: 'Arial' });
  const none = { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const rule = { style: d.BorderStyle.SINGLE, size: 4, color: '999999' };
  const contentW = ((orientation === 'landscape' ? p.h : p.w) - 44) * TW;
  const widths = [contentW * 0.62, contentW * 0.19, contentW * 0.19].map(Math.round);
  const cell = (text: string, i: number, r: LedgerRow) =>
    new d.TableCell({
      width: { size: widths[i], type: d.WidthType.DXA },
      borders: { left: none, right: none, top: r.ruleAbove ? rule : none, bottom: r.ruleBelow ? rule : none },
      children: [
        new d.Paragraph({
          alignment: i === 0 ? d.AlignmentType.LEFT : d.AlignmentType.RIGHT,
          indent: i === 0 && r.indent ? { left: 1000 } : undefined,
          children: [run(text, !!r.bold)],
        }),
      ],
    });
  const table = new d.Table({
    columnWidths: widths,
    width: { size: widths.reduce((a, b) => a + b, 0), type: d.WidthType.DXA },
    rows: l.rows.map((r) => new d.TableRow({ children: [cell(r.label, 0, r), cell(r.mid ?? '', 1, r), cell(r.amount ?? '', 2, r)] })),
  });
  const doc = new d.Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: Math.round(p.w * TW), height: Math.round(p.h * TW), orientation: orientation === 'landscape' ? d.PageOrientation.LANDSCAPE : d.PageOrientation.PORTRAIT },
            margin: { top: 1200, bottom: 1200, left: 1247, right: 1247 },
          },
        },
        children: [
          new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [run(l.title, true, 32)] }),
          new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { after: 400 }, children: [run(l.dateLine, true, 22)] }),
          table,
          ...(l.notes.length
            ? [new d.Paragraph({ spacing: { before: 400 }, children: [run('Note:', true)] }), ...l.notes.map((n) => new d.Paragraph({ children: [run(n)] }))]
            : []),
        ],
      },
    ],
  });
  return d.Packer.toBlob(doc);
}
