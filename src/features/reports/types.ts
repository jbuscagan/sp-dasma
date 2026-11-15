import type { ReportHeader } from './header';

export type ExportFormat = 'pdf' | 'docx' | 'xlsx';
export type PaperKey = 'A4' | 'LETTER' | 'LEGAL' | 'FOLIO' | 'A3';
export type Orientation = 'landscape' | 'portrait';

/** Portrait sizes in millimetres + Excel paper codes. "Long" = 8.5 x 13 in (folio, common in PH offices). */
export const PAPERS: Record<PaperKey, { label: string; w: number; h: number; excel: number }> = {
  A4: { label: 'A4 (210 × 297 mm)', w: 210, h: 297, excel: 9 },
  LETTER: { label: 'Short / Letter (8.5 × 11 in)', w: 215.9, h: 279.4, excel: 1 },
  FOLIO: { label: 'Long / Folio (8.5 × 13 in)', w: 215.9, h: 330.2, excel: 14 },
  LEGAL: { label: 'Legal (8.5 × 14 in)', w: 215.9, h: 355.6, excel: 5 },
  A3: { label: 'A3 (297 × 420 mm)', w: 297, h: 420, excel: 8 },
};

export const FORMATS: Record<ExportFormat, string> = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel' };

/** Format-neutral report: every generator (PDF / Word / Excel) renders this same object. */
export interface ReportDoc {
  header: ReportHeader;
  head: string[]; // includes "#"
  body: string[][];
  widths: number[]; // relative
  italicCols: number[];
  headerColor: string;
  headerText: string;
  note: string;
  encoderName: string;
  encoderPosition: string;
  paper: PaperKey;
  orientation: Orientation;
  filename: string; // without extension
  footRow?: string[]; // e.g. totals row, same length as head
  alignRight?: number[]; // column indexes aligned right (amounts)
}

export const DEFAULT_NOTE = 'This document serves as a summary of requests addressed to our office.';
