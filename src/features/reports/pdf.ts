// PDF output (jsPDF + autoTable). Layout follows the sample transmittals.
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { addPdfFonts, PDF_FONT } from '@/lib/pdfFonts';
import type { ReportDoc } from './types';
import { PAPERS } from './types';
import { pageSize } from './build';

export const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};

export async function renderPdf(r: ReportDoc): Promise<Blob> {
  const { w, h } = pageSize(r, PAPERS);
  const doc = new jsPDF({ unit: 'mm', format: [w, h], orientation: r.orientation });
  await addPdfFonts(doc);
  const F = PDF_FONT;
  const m = 12;

  // Header height depends on which lines are used.
  let titleY = m + 8;
  if (r.header.office) titleY += 6;
  const tableTop = titleY + (r.header.subtitle ? 12 : 6);

  const drawHeader = () => {
    doc.setTextColor(0);
    doc.setFont(F, 'bold').setFontSize(9);
    if (r.header.code) doc.text(r.header.code, m, m + 2);
    if (r.header.dateText) doc.text(r.header.dateText, m, m + 6.5);
    doc.setFont(F, 'normal');
    if (r.header.covering) doc.text(`Covering: ${r.header.covering}`, w - m, m + 2, { align: 'right' });
    if (r.header.office) {
      doc.setFont(F, 'bold').setFontSize(11);
      doc.text(r.header.office, w / 2, titleY - 6, { align: 'center' });
    }
    doc.setFont(F, 'bold').setFontSize(14);
    doc.text(r.header.title, w / 2, titleY + 1, { align: 'center' });
    if (r.header.subtitle) {
      doc.setFontSize(11).text(r.header.subtitle, w / 2, titleY + 7, { align: 'center' });
    }
  };

  const usable = w - 2 * m;
  const total = r.widths.reduce((a, b) => a + b, 0);
  const columnStyles: Record<number, { cellWidth: number; fontStyle?: 'italic'; halign?: 'right' }> = {};
  r.widths.forEach((cw, i) => {
    columnStyles[i] = { cellWidth: (cw / total) * usable };
    if (r.italicCols.includes(i)) columnStyles[i].fontStyle = 'italic';
    if (r.alignRight?.includes(i)) columnStyles[i].halign = 'right';
  });

  autoTable(doc, {
    head: [r.head],
    body: r.body,
    foot: r.footRow ? [r.footRow] : undefined,
    showFoot: 'lastPage',
    startY: tableTop,
    margin: { top: m, left: m, right: m, bottom: m + 6 }, // pages 2+ start at the top (no header)
    theme: 'grid',
    styles: {
      font: F,
      fontSize: 8,
      halign: 'center',
      valign: 'middle',
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      cellPadding: 1.4,
      minCellHeight: 7,
    },
    headStyles: { fillColor: hexToRgb(r.headerColor), textColor: hexToRgb(r.headerText), fontStyle: 'bold', halign: 'center', valign: 'middle' },
    footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles,
    didDrawPage: (d) => {
      if (d.pageNumber === 1) drawHeader(); // the header is printed on the first page only
    },
  });

  // Note + encoder under the table (no line under the name)
  const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = lastY + 8;
  if (y + 22 > h - m) {
    doc.addPage();
    y = m + 6;
  }
  if (r.note) {
    doc.setFontSize(9).setFont(F, 'bold');
    const label = 'Note: ';
    const labelW = doc.getTextWidth(label);
    doc.setFont(F, 'normal');
    const startX = w / 2 - (labelW + doc.getTextWidth(r.note)) / 2;
    doc.setFont(F, 'bold').text(label, startX, y);
    doc.setFont(F, 'normal').text(r.note, startX + labelW, y);
  }

  if (r.encoderName) {
    y += 10;
    doc.setFontSize(9).setFont(F, 'normal').text('Encoded by:', m, y);
    doc.setFont(F, 'bold').text(r.encoderName.toUpperCase(), m, y + 8);
    doc.setFont(F, 'normal').text(r.encoderPosition || '', m, y + 12);
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7).setFont(F, 'normal').setTextColor(90);
    doc.text(`Page ${i} of ${pages}`, w - m, h - 5, { align: 'right' });
  }

  return doc.output('blob');
}
