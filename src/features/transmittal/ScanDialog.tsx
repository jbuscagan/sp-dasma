'use client';
import { Icon } from '@/components/ui/Icon';
// Upload button: take/choose photos of letters -> they are stored, scanned (OCR),
// and a new entry is pre-filled with what was found.
import { useState } from 'react';
import { Alert, Button, Modal } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import type { EntryInput } from '@/lib/types';
import { uploadAttachment } from './api';
import { extractHints, ocrImage } from './scan';

export function ScanDialog({
  open,
  onClose,
  onReady,
}: {
  open: boolean;
  onClose: () => void;
  onReady: (prefill: EntryInput, text: string) => void;
}) {
  const { committee } = useSession();
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (doOcr: boolean) => {
    if (!committee || !files.length) return;
    setBusy(true);
    setError('');
    try {
      const paths: string[] = [];
      const texts: string[] = [];
      for (const [i, f] of files.entries()) {
        setStatus(`Uploading ${i + 1} of ${files.length}…`);
        paths.push(await uploadAttachment(f, committee.id, f.name.split('.').pop() || 'jpg'));
        if (doOcr && f.type.startsWith('image/')) {
          texts.push(await ocrImage(f, (p) => setStatus(`Reading text from photo ${i + 1} of ${files.length}… ${p}%`)));
        }
      }
      const text = texts.join('\n\n-----\n\n').trim();
      const hints = extractHints(text);
      onReady(
        {
          attachment_paths: paths,
          contact_number: hints.phones[0] ?? null,
          event_date: hints.dates[0] ?? null,
        },
        text || '(No text was found. Fill in the fields from the attached photo.)',
      );
      setFiles([]);
      setStatus('');
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
      title="Upload & scan a solicitation letter"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" busy={busy} disabled={!files.length} onClick={() => run(false)}>
            Attach only
          </Button>
          <Button busy={busy} disabled={!files.length} onClick={() => run(true)}>
            Scan &amp; fill form
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Take a photo with your phone or choose image files. The photos are saved with the entry. “Scan” reads the text and pre-fills
          the contact number and event date — you then complete and check the form.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line px-4 py-6 text-center hover:border-brand-500">
            <Icon name="camera" size={28} className="text-brand-600" />
            <span className="mt-2 text-sm font-semibold">Take a photo</span>
            <span className="text-xs text-muted">Opens the camera on phones</span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])} />
          </label>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line px-4 py-6 text-center hover:border-brand-500">
            <Icon name="file" size={28} className="text-brand-600" />
            <span className="mt-2 text-sm font-semibold">Choose files</span>
            <span className="text-xs text-muted">JPG / PNG (PDF is attached, not scanned)</span>
            <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])} />
          </label>
        </div>
        {files.length > 0 && (
          <ul className="text-sm">
            {files.map((f) => (
              <li key={f.name + f.size} className="flex justify-between gap-2">
                <span className="truncate">• {f.name} ({Math.round(f.size / 1024)} KB)</span>
                <button type="button" className="text-xs text-red-600" onClick={() => setFiles((all) => all.filter((x) => x !== f))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        {status && <Alert>{status}</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
