import type { Entry } from '@/lib/types';
import type { ColumnDef } from '@/features/transmittal/config';
import type { ReportHeader } from './header';
import type { Orientation, PaperKey, ReportDoc } from './types';
import { DEFAULT_NOTE } from './types';

export interface BuildOptions<T = Entry> {
  header: ReportHeader;
  columns: ColumnDef<T>[];
  entries: T[];
  headerColor: string;
  headerText: string;
  encoderName: string;
  encoderPosition: string;
  paper: PaperKey;
  orientation: Orientation;
  /** When given, adds a "RECEIVED" column, e.g. "☑ Office of SPM X". */
  received?: (e: T) => string;
  /** Blank numbered rows added at the end (the samples leave room for walk-ins). */
  blankRows?: number;
  note?: string;
  footRow?: string[];
  alignRight?: number[];
}

export function buildReport<T = Entry>(o: BuildOptions<T>): ReportDoc {
  const columns = [...o.columns];
  if (o.received) columns.push({ label: 'RECEIVED', width: 10, value: o.received });

  const body = o.entries.map((e, i) => [String(i + 1), ...columns.map((c) => c.value(e) ?? '')]);
  for (let i = 0; i < (o.blankRows ?? 0); i++) {
    body.push([String(body.length + 1), ...columns.map(() => '')]);
  }

  return {
    header: o.header,
    head: ['#', ...columns.map((c) => c.label)],
    body,
    widths: [3, ...columns.map((c) => c.width)],
    italicCols: columns.map((c, i) => (c.italic ? i + 1 : -1)).filter((i) => i > 0),
    headerColor: o.headerColor,
    headerText: o.headerText,
    note: o.note ?? DEFAULT_NOTE,
    encoderName: o.encoderName,
    encoderPosition: o.encoderPosition,
    paper: o.paper,
    orientation: o.orientation,
    footRow: o.footRow,
    alignRight: o.alignRight ?? columns.map((c, i) => (c.right ? i + 1 : -1)).filter((i) => i > 0),
    filename: (o.header.code || o.header.title).replace(/[\\/:*?"<>|]/g, '').trim() || 'report',
  };
}

/** Page size in mm, already rotated for the orientation. */
export function pageSize(doc: Pick<ReportDoc, 'paper' | 'orientation'>, papers: Record<string, { w: number; h: number }>) {
  const p = papers[doc.paper];
  return doc.orientation === 'landscape' ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}
