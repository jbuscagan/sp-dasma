'use client';
import { useState } from 'react';
import { Alert, Badge, Button, Modal } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { fmtLong } from '@/lib/dates';
import type { Entry, Flag } from '@/lib/types';
import { addFlag, resolveFlag } from '@/features/transmittal/api';
import { displayName } from '@/features/transmittal/config';

/** Raise / review / resolve discrepancy remarks on one entry. */
export function FlagDialog({ entry, flags, onClose }: { entry: Entry | null; flags: Flag[]; onClose: () => void }) {
  const { committee, committeeName, isAdmin } = useSession();
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!entry) return null;

  const canResolve = (f: Flag) => isAdmin || f.committee_id === committee?.id || entry.committee_id === committee?.id;

  const raise = async () => {
    if (!note.trim() || !committee) return;
    setBusy(true);
    try {
      await addFlag(entry.id, committee.id, note.trim());
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Remarks / discrepancies — ${displayName(entry).replace('\n', ' · ')}`}>
      <div className="space-y-3">
        {error && <Alert kind="error">{error}</Alert>}
        {flags.length === 0 && <p className="text-sm text-muted">No remarks yet.</p>}
        {flags.map((f) => (
          <div key={f.id} className="rounded-lg border border-line p-3 text-sm">
            <div className="mb-1 flex items-center gap-2">
              <Badge color={f.status === 'open' ? 'amber' : 'green'}>{f.status}</Badge>
              <span className="text-xs text-muted">{committeeName(f.committee_id)} · {fmtLong(f.created_at)}</span>
            </div>
            <p>{f.note}</p>
            {f.status === 'resolved' && <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Resolved: {f.resolution}</p>}
            {f.status === 'open' && canResolve(f) && (
              <div className="mt-2 flex gap-2">
                <input
                  className="input"
                  placeholder="What was checked / corrected?"
                  value={resolution[f.id] ?? ''}
                  onChange={(e) => setResolution((r) => ({ ...r, [f.id]: e.target.value }))}
                />
                <Button size="sm" onClick={() => resolveFlag(f.id, resolution[f.id] || 'Reviewed')}>Resolve</Button>
              </div>
            )}
          </div>
        ))}
        <div className="border-t border-line pt-3">
          <span className="label">Add a remark</span>
          <textarea
            className="input min-h-[70px]"
            placeholder="e.g. Contact number does not match the one submitted to the Office of SPM …"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <Button busy={busy} disabled={!note.trim()} onClick={raise}>Add remark</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
