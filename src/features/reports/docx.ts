// Word output (docx library). Same layout as the PDF.
import {
  AlignmentType, BorderStyle, Document, Packer, PageOrientation, Paragraph, ShadingType,
  Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';
import type { ReportDoc } from './types';
import { PAPERS } from './types';

const TWIP_PER_MM = 56.6929;
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };

const lines = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) =>
  text.split('\n').map((t, i) => new TextRun({ text: t, break: i > 0 ? 1 : 0, font: 'Arial', size: opts.size ?? 16, ...opts }));

export async function renderDocx(r: ReportDoc): Promise<Blob> {
  const paper = PAPERS[r.paper];
  const margin = 12 * TWIP_PER_MM;
  const contentWidthMm = (r.orientation === 'landscape' ? paper.h : paper.w) - 24;
  const total = r.widths.reduce((a, b) => a + b, 0);
  const colTwips = r.widths.map((cw) => Math.round((cw / total) * contentWidthMm * TWIP_PER_MM));
  const fill = r.headerColor.replace('#', '');
  const headColor = r.headerText.replace('#', '');

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: NO_BORDERS,
            children: [
              new Paragraph({ children: lines(r.header.code || ' ', { bold: true, size: 18 }) }),
              new Paragraph({ children: lines(r.header.dateText || ' ', { bold: true, size: 18 }) }),
            ],
          }),
          new TableCell({
            borders: NO_BORDERS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: lines(r.header.covering ? `Covering: ${r.header.covering}` : ' ', { size: 18 }) })],
          }),
        ],
      }),
    ],
  });

  const dataTable = new Table({
    layout: TableLayoutType.FIXED,
    columnWidths: colTwips,
    width: { size: colTwips.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: r.head.map((h, i) =>
          new TableCell({
            width: { size: colTwips[i], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: lines(h, { bold: true, color: headColor }) })],
          }),
        ),
      }),
      ...[...r.body, ...(r.footRow ? [r.footRow] : [])].map((row, ri) =>
        new TableRow({
          cantSplit: true,
          children: row.map((cell, i) =>
            new TableCell({
              width: { size: colTwips[i], type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: r.alignRight?.includes(i) ? AlignmentType.RIGHT : AlignmentType.CENTER,
                  children: lines(cell || ' ', { italics: r.italicCols.includes(i), bold: ri === r.body.length }),
                }),
              ],
            }),
          ),
        }),
      ),
    ],
  });

  const children: (Paragraph | Table)[] = [headerTable];
  if (r.header.office) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: lines(r.header.office, { bold: true, size: 22 }) }));
  }
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: r.header.subtitle ? 0 : 160 }, children: lines(r.header.title, { bold: true, size: 28 }) }));
  if (r.header.subtitle) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: lines(r.header.subtitle, { bold: true, size: 22 }) }));
  }
  children.push(dataTable);
  if (r.note) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240 },
        children: [...lines('Note: ', { bold: true, size: 18 }), ...lines(r.note, { size: 18 })],
      }),
    );
  }

  if (r.encoderName) {
    children.push(
      new Paragraph({ spacing: { before: 240 }, children: lines('Encoded by:', { size: 18 }) }),
      new Paragraph({ spacing: { before: 240 }, children: lines(r.encoderName.toUpperCase(), { bold: true, size: 18 }) }),
      new Paragraph({ children: lines(r.encoderPosition || '', { size: 18 }) }),
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: Math.round(paper.w * TWIP_PER_MM),
              height: Math.round(paper.h * TWIP_PER_MM),
              orientation: r.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: { top: margin, bottom: margin, left: margin, right: margin },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}
