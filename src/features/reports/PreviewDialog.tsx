'use client';
// Shows a saved report on screen (PDF) without downloading it. Several files = one tab each.
import { useEffect, useState } from 'react';
import { Alert, Button, Modal } from '@/components/ui';

export interface PreviewPage {
  label: string;
  render: () => Promise<Blob>; // must return a PDF
}

export function PreviewDialog({ open, title, pages, onClose }: { open: boolean; title: string; pages: PreviewPage[]; onClose: () => void }) {
  const [tab, setTab] = useState(0);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let made = '';
    setUrl('');
    setError('');
    pages[tab]
      ?.render()
      .then((blob) => {
        made = URL.createObjectURL(blob);
        if (alive) setUrl(made);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  useEffect(() => {
    if (open) setTab(0);
  }, [open]);

  if (!open) return null;
  return (
    <Modal open onClose={onClose} title={title} wide footer={<Button onClick={onClose}>Close</Button>}>
      {pages.length > 1 && (
        <div className="mb-3 flex gap-1 rounded-lg border border-line p-0.5" role="tablist">
          {pages.map((p, i) => (
            <button
              key={p.label}
              role="tab"
              aria-selected={tab === i}
              onClick={() => setTab(i)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${tab === i ? 'bg-brand-600 text-white dark:text-surface' : 'text-muted hover:bg-brand-50'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {!error && !url && <div className="grid h-[65vh] place-items-center text-sm text-muted">Preparing preview…</div>}
      {url && <iframe title={pages[tab]?.label ?? title} src={url} className="h-[70vh] w-full rounded-lg border border-line bg-white" />}
    </Modal>
  );
}
