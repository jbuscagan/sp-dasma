'use client';
// Small "choose format + paper" dialog for reports that are not tables (SP contribution).
import { useState } from 'react';
import { Alert, Button, Field, Modal } from '@/components/ui';
import { downloadBlob } from '@/features/reports/export';
import { PAPERS, type ExportFormat, type Orientation, type PaperKey } from '@/features/reports/types';
import { FormatPicker } from '@/features/reports/FormatPicker';

const EXT: Record<ExportFormat, string> = { pdf: 'pdf', docx: 'docx', xlsx: 'xlsx' };

export function FormatDialog({
  open,
  onClose,
  title,
  filename,
  render,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  filename: string;
  render: (f: ExportFormat, p: PaperKey, o: Orientation) => Promise<Blob>;
}) {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [paper, setPaper] = useState<PaperKey>('A4');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const go = async () => {
    setBusy(true);
    setError('');
    try {
      downloadBlob(await render(format, paper, orientation), `${filename}.${EXT[format]}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button busy={busy} onClick={go}>Generate</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Format">
          <FormatPicker value={format} onChange={setFormat} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paper size">
            <select className="input" value={paper} onChange={(e) => setPaper(e.target.value as PaperKey)}>
              {(Object.keys(PAPERS) as PaperKey[]).map((k) => <option key={k} value={k}>{PAPERS[k].label}</option>)}
            </select>
          </Field>
          <Field label="Orientation">
            <select className="input" value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
