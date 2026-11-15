// Excel output (ExcelJS). Same layout, print-ready (paper size, fit to width, repeat header row).
import ExcelJS from 'exceljs';
import type { ReportDoc } from './types';
import { PAPERS } from './types';

const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase();
const thin = { style: 'thin' as const, color: { argb: 'FF000000' } };

export async function renderXlsx(r: ReportDoc): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SP Dasmariñas Committee Platform';
  const ws = wb.addWorksheet((r.filename || 'Report').replace(/[*?:\\/[\]]/g, ' ').slice(0, 31).trim() || 'Report', {
    pageSetup: {
      paperSize: PAPERS[r.paper].excel as ExcelJS.PaperSize,
      orientation: r.orientation,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      horizontalCentered: true,
    },
  });

  const n = r.head.length;
  const total = r.widths.reduce((a, b) => a + b, 0);
  ws.columns = r.widths.map((w) => ({ width: Math.max(4, Math.round((w / total) * 150)) }));

  const lastCol = ws.getColumn(n).letter;
  ws.getCell('A1').value = r.header.code;
  ws.getCell('A1').font = { bold: true, name: 'Arial', size: 9 };
  ws.getCell('A2').value = r.header.dateText;
  ws.getCell('A2').font = { bold: true, name: 'Arial', size: 9 };
  ws.getCell(`${lastCol}1`).value = r.header.covering ? `Covering: ${r.header.covering}` : '';
  ws.getCell(`${lastCol}1`).alignment = { horizontal: 'right' };
  ws.getCell(`${lastCol}1`).font = { name: 'Arial', size: 9 };

  ws.mergeCells(`A4:${lastCol}4`);
  ws.getCell('A4').value = r.header.office || r.header.title;
  ws.getCell('A4').font = { bold: true, name: 'Arial', size: r.header.office ? 11 : 14 };
  ws.getCell('A4').alignment = { horizontal: 'center' };
  ws.mergeCells(`A5:${lastCol}5`);
  ws.getCell('A5').value = r.header.office ? r.header.title : r.header.subtitle ?? '';
  ws.getCell('A5').font = { bold: true, name: 'Arial', size: r.header.office ? 14 : 11 };
  ws.getCell('A5').alignment = { horizontal: 'center' };
  if (r.header.office && r.header.subtitle) {
    ws.mergeCells(`A6:${lastCol}6`);
    ws.getCell('A6').value = r.header.subtitle;
    ws.getCell('A6').font = { bold: true, name: 'Arial', size: 11 };
    ws.getCell('A6').alignment = { horizontal: 'center' };
  }

  const headRow = ws.getRow(7);
  r.head.forEach((h, i) => {
    const c = headRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, name: 'Arial', size: 9, color: { argb: argb(r.headerText) } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(r.headerColor) } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: thin, left: thin, bottom: thin, right: thin };
  });
  headRow.height = 30;

  const rows = [...r.body, ...(r.footRow ? [r.footRow] : [])];
  rows.forEach((row, ri) => {
    const xr = ws.getRow(8 + ri);
    const isFoot = ri === r.body.length;
    row.forEach((v, i) => {
      const c = xr.getCell(i + 1);
      c.value = v;
      c.font = { name: 'Arial', size: 9, italic: r.italicCols.includes(i), bold: isFoot };
      c.alignment = { horizontal: r.alignRight?.includes(i) ? 'right' : 'center', vertical: 'middle', wrapText: true };
      c.border = { top: thin, left: thin, bottom: thin, right: thin };
    });
    const maxLines = Math.max(1, ...row.map((v) => v.split('\n').length));
    xr.height = Math.max(22, maxLines * 13);
  });

  let y = 8 + rows.length + 1;
  if (r.note) {
    ws.mergeCells(`A${y}:${lastCol}${y}`);
    ws.getCell(`A${y}`).value = {
      richText: [
        { text: 'Note: ', font: { bold: true, name: 'Arial', size: 9 } },
        { text: r.note, font: { name: 'Arial', size: 9 } },
      ],
    };
    ws.getCell(`A${y}`).alignment = { horizontal: 'center' };
  }

  if (r.encoderName) {
    y += 2;
    ws.getCell(`B${y}`).value = 'Encoded by:';
    ws.getCell(`B${y + 2}`).value = r.encoderName.toUpperCase();
    ws.getCell(`B${y + 2}`).font = { bold: true, name: 'Arial', size: 9 };
    ws.getCell(`B${y + 3}`).value = r.encoderPosition || '';
  }

  ws.pageSetup.printTitlesRow = '7:7';
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
