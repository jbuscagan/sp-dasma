'use client';
import { useMemo, useState } from 'react';
import { Alert, Button, PageHeader } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { deleteEntry, setEntryStatus } from '@/features/transmittal/api';
import { EntryTable, matches } from '@/features/transmittal/EntryTable';
import { combinedColumns } from './columns';
import { useHistoryData } from './useHistoryData';

/** History › Archived: removed entries, kept for reference. They can be restored. */
export function ArchivedHistory() {
  const { committee, committeeName, isAdmin } = useSession();
  const [q, setQ] = useState('');
  const { entries, error } = useHistoryData(
    { status: 'archived', committeeId: isAdmin ? null : committee?.id },
    [committee?.id, isAdmin],
  );
  const columns = useMemo(() => combinedColumns(committeeName, isAdmin), [committeeName, isAdmin]);
  const rows = entries.filter((e) => matches(e, columns, q));

  return (
    <>
      <PageHeader title="Archived" subtitle={isAdmin ? 'Archived entries of all offices (admin view).' : 'Entries your office removed from Published.'} />
      {error && <div className="mb-3"><Alert kind="error">{error}</Alert></div>}
      <div className="card">
        <div className="border-b border-line p-3">
          <input className="input max-w-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <EntryTable
          entries={rows}
          columns={columns}
          empty="Nothing archived."
          extra={[{ header: 'Reason', cell: (e) => <span className="text-xs">{e.archived_reason || '—'}</span> }]}
          actions={(e) => (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEntryStatus([e.id], e.transmittal_id ? 'transmitted' : 'draft')}>Restore</Button>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => confirm('Delete permanently? This cannot be undone.') && deleteEntry(e.id)}
                >
                  Delete
                </Button>
              )}
            </>
          )}
        />
      </div>
    </>
  );
}
