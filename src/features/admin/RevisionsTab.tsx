'use client';
// Admin › Revision requests: unlock a transmitted list so the office can correct it.
import { Icon } from '@/components/ui/Icon';
import { useState } from 'react';
import { listTransmittals, setRevisionOpen } from '@/features/transmittal/api';
import { TYPES } from '@/features/transmittal/config';
import { Alert, Badge, Button } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useLive } from '@/hooks/useLive';
import { fmtLong } from '@/lib/dates';

export function RevisionsTab() {
  const { committeeName } = useSession();
  const tx = useLive(() => listTransmittals(), ['transmittals']);
  const [error, setError] = useState('');
  const list = (tx.data ?? []).filter((t) => t.revision_requested_at || t.revision_open);
  const run = (p: Promise<unknown>) => p.catch((e) => setError(e instanceof Error ? e.message : String(e)));
  return (
    <div className="card overflow-x-auto">
      {error && <div className="p-3"><Alert kind="error">{error}</Alert></div>}
      <table className="table-base">
        <thead><tr><th>Office</th><th>Transmittal</th><th>Reason</th><th>Requested</th><th>Status</th><th /></tr></thead>
        <tbody>
          {list.map((t) => (
            <tr key={t.id}>
              <td className="font-medium">{committeeName(t.committee_id)}</td>
              <td><span className="font-mono text-xs">{t.code}</span><div className="text-xs text-muted">{TYPES[t.type].label}</div></td>
              <td className="max-w-xs text-sm">{t.revision_reason || '—'}</td>
              <td className="text-xs">{t.revision_requested_at ? fmtLong(t.revision_requested_at) : '—'}</td>
              <td>{t.revision_open ? <Badge color="amber">Open</Badge> : <Badge color="blue">Waiting</Badge>}</td>
              <td className="whitespace-nowrap text-right">
                {t.revision_open ? (
                  <Button size="sm" variant="secondary" onClick={() => run(setRevisionOpen(t.id, false))}><Icon name="lock" size={14} />Lock again</Button>
                ) : (
                  <>
                    <Button size="sm" onClick={() => run(setRevisionOpen(t.id, true))}>Allow revision</Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => run(setRevisionOpen(t.id, false))}>Decline</Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!list.length && <p className="p-6 text-center text-sm text-muted">No revision requests.</p>}
    </div>
  );
}
