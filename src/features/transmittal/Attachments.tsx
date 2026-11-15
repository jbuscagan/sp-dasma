'use client';
import { useState } from 'react';
import { useSession } from '@/features/auth/session';
import { attachmentUrl, uploadAttachment } from './api';

/** Photos of the solicitation letter attached to an entry. */
export function AttachmentList({ paths, onChange, readOnly }: { paths: string[]; onChange?: (p: string[]) => void; readOnly?: boolean }) {
  const { committee } = useSession();
  const [busy, setBusy] = useState(false);

  const open = async (p: string) => window.open(await attachmentUrl(p), '_blank', 'noopener');

  const add = async (files: FileList | null) => {
    if (!files || !committee || !onChange) return;
    setBusy(true);
    try {
      const added: string[] = [];
      for (const f of Array.from(files)) {
        added.push(await uploadAttachment(f, committee.id, f.name.split('.').pop() || 'jpg'));
      }
      onChange([...paths, ...added]);
    } finally {
      setBusy(false);
    }
  };

  if (readOnly && !paths.length) return null;
  return (
    <div>
      <div className="label">Attachments</div>
      <div className="flex flex-wrap items-center gap-2">
        {paths.map((p, i) => (
          <span key={p} className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-xs">
            <button type="button" className="text-brand-600 hover:underline" onClick={() => open(p)}>
              📎 File {i + 1}
            </button>
            {!readOnly && onChange && (
              <button type="button" className="text-muted hover:text-red-600" aria-label="Remove attachment" onClick={() => onChange(paths.filter((x) => x !== p))}>
                ✕
              </button>
            )}
          </span>
        ))}
        {!readOnly && onChange && (
          <label className="cursor-pointer rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted hover:border-brand-500 hover:text-brand-600">
            {busy ? 'Uploading…' : '+ Attach photo / file'}
            <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => add(e.target.files)} />
          </label>
        )}
      </div>
    </div>
  );
}
