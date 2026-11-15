'use client';
// Asks for file format + paper size (and lets the user check the header) before generating any report.
import { useEffect, useState } from 'react';
import { Alert, Button, Field, Modal } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import type { Entry } from '@/lib/types';
import type { ColumnDef } from '@/features/transmittal/config';
import { buildReport } from './build';
import { exportReport } from './export';
import type { ReportHeader } from './header';
import { PAPERS, type ExportFormat, type Orientation, type PaperKey } from './types';
import { FormatPicker } from './FormatPicker';
import { DEFAULT_NOTE } from './types';
import { SWATCHES, textOn } from './colors';

export interface ExportRequest {
  header: ReportHeader;
  transmitDate: string;
  encoderName: string;
  encoderPosition: string;
}

const PREF_KEY = 'export-prefs';
const loadPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
  } catch {
    return {};
  }
};

export function ExportDialog<T = Entry>({
  open,
  onClose,
  title,
  entries,
  columns,
  headerColor,
  headerText,
  makeHeader,
  initialDate,
  confirmLabel = 'Generate',
  beforeExport,
  received,
  intro,
  dateLabel = 'Date transmitted / completed',
  note,
  showEncoder = true,
  footRow,
  defaultPaper,
  defaultOrientation,
  outputs,
  filename,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  entries: T[];
  columns: ColumnDef<T>[];
  headerColor: string;
  headerText: string;
  makeHeader: (date: string) => ReportHeader; // recalculated when the date changes
  initialDate: string;
  confirmLabel?: string;
  beforeExport?: (req: ExportRequest) => Promise<void>; // e.g. save the transmittal first
  received?: (e: T) => string;
  intro?: React.ReactNode;
  dateLabel?: string;
  note?: string; // '' = no note line
  showEncoder?: boolean;
  footRow?: string[]; // e.g. totals
  defaultPaper?: PaperKey;
  defaultOrientation?: Orientation;
  /** Several files from one click (same header and paper), e.g. claim sheet + amount report. */
  outputs?: { suffix: string; columns: ColumnDef<T>[]; footRow?: string[] }[];
  filename?: string; // base file name (without extension)
}) {
  const { profile } = useSession();
  const [date, setDate] = useState(initialDate);
  const [header, setHeader] = useState<ReportHeader>(() => makeHeader(initialDate));
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [paper, setPaper] = useState<PaperKey>('A4');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [withReceived, setWithReceived] = useState(false);
  const [color, setColor] = useState(headerColor);
  const [withNote, setWithNote] = useState(true);
  const [blankRows, setBlankRows] = useState(0);
  const [encoder, setEncoder] = useState({ name: '', position: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const p = loadPrefs();
    if (p.format) setFormat(p.format);
    setPaper(defaultPaper ?? p.paper ?? 'A4');
    setOrientation(defaultOrientation ?? p.orientation ?? 'landscape');
    setDate(initialDate);
    setHeader(makeHeader(initialDate));
    setEncoder({ name: profile.encoder_name ?? '', position: profile.position ?? '' });
    setColor(headerColor);
    setWithNote(note !== '');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const changeDate = (d: string) => {
    setDate(d);
    if (d) setHeader(makeHeader(d));
  };

  const go = async () => {
    setBusy(true);
    setError('');
    try {
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify({ format, paper, orientation }));
      } catch {
        /* ignore */
      }
      if (beforeExport) await beforeExport({ header, transmitDate: date, encoderName: encoder.name, encoderPosition: encoder.position });
      const list = outputs ?? [{ suffix: '', columns, footRow }];
      for (const [i, o] of list.entries()) {
        const doc = buildReport<T>({
          header,
          columns: o.columns,
          entries,
          headerColor: color,
          headerText: color.toLowerCase() === headerColor.toLowerCase() ? headerText : textOn(color),
          encoderName: showEncoder ? encoder.name : '',
          encoderPosition: showEncoder ? encoder.position : '',
          note: withNote ? (note || DEFAULT_NOTE) : '',
          footRow: o.footRow,
          paper,
          orientation,
          received: withReceived ? received : undefined,
          blankRows,
        });
        if (filename) doc.filename = filename;
        if (o.suffix) doc.filename = `${doc.filename} - ${o.suffix}`;
        if (i > 0) await new Promise((r) => setTimeout(r, 600)); // let the browser start the previous download
        await exportReport(doc, format);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const h = (k: keyof ReportHeader) => (e: React.ChangeEvent<HTMLInputElement>) => setHeader((s) => ({ ...s, [k]: e.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      wide
      footer={
        <>
          <span className="mr-auto self-center text-sm text-muted">
            {entries.length} row(s){outputs && outputs.length > 1 ? ` · ${outputs.length} files: ${outputs.map((o) => o.suffix).join(' + ')}` : ''}
          </span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button busy={busy} onClick={go} disabled={!entries.length}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {intro}
        {error && <Alert kind="error">{error}</Alert>}

        <section>
          <h3 className="mb-2 text-sm font-semibold">1. File format &amp; paper</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Format">
              <FormatPicker value={format} onChange={setFormat} />
            </Field>
            <Field label="Paper size">
              <select className="input" value={paper} onChange={(e) => setPaper(e.target.value as PaperKey)}>
                {(Object.keys(PAPERS) as PaperKey[]).map((k) => (
                  <option key={k} value={k}>{PAPERS[k].label}</option>
                ))}
              </select>
            </Field>
            <Field label="Orientation">
              <select className="input" value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)}>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </Field>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">2. Header (check before generating)</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={dateLabel}>
              <input type="date" className="input" value={date} onChange={(e) => changeDate(e.target.value)} />
            </Field>
            <Field label="Code"><input className="input" value={header.code} onChange={h('code')} /></Field>
            <Field label="Covering"><input className="input" value={header.covering} onChange={h('covering')} /></Field>
            <Field label="Office" className="sm:col-span-3"><input className="input" value={header.office} onChange={h('office')} /></Field>
            <Field label="Title" className="sm:col-span-3"><input className="input" value={header.title} onChange={h('title')} /></Field>
            {header.subtitle !== undefined && (
              <Field label="Line under the title" className="sm:col-span-3"><input className="input" value={header.subtitle} onChange={h('subtitle')} /></Field>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">3. {showEncoder ? 'Encoder & options' : 'Options'}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {showEncoder && <Field label="Encoder's name"><input className="input" value={encoder.name} onChange={(e) => setEncoder((s) => ({ ...s, name: e.target.value }))} /></Field>}
            {showEncoder && <Field label="Position"><input className="input" value={encoder.position} onChange={(e) => setEncoder((s) => ({ ...s, position: e.target.value }))} /></Field>}
            <Field label="Extra blank rows">
              <input type="number" min={0} max={30} className="input" value={blankRows} onChange={(e) => setBlankRows(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} />
            </Field>
          </div>
          <div className="mt-3">
            <span className="label">Table header colour</span>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((sw) => (
                <button
                  key={sw.hex}
                  type="button"
                  title={sw.label}
                  aria-label={sw.label}
                  aria-pressed={color.toLowerCase() === sw.hex}
                  onClick={() => setColor(sw.hex)}
                  className={`h-8 w-8 rounded-lg border-2 ${color.toLowerCase() === sw.hex ? 'border-brand-600 ring-2 ring-brand-500/30' : 'border-line'}`}
                  style={{ background: sw.hex }}
                />
              ))}
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs" title="Any colour">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" />
                Custom
              </label>
              <span className="rounded px-2 py-1 text-xs font-semibold" style={{ background: color, color: textOn(color), border: '1px solid rgb(var(--line))' }}>Preview</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={withNote} onChange={(e) => setWithNote(e.target.checked)} />
              Include the note (“{note || DEFAULT_NOTE}”)
            </label>
            {received && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={withReceived} onChange={(e) => setWithReceived(e.target.checked)} />
                Include “Received by”
              </label>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
