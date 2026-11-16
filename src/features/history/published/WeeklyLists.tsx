'use client';
// Published (All) › Weekly published: the lists published so far (open / generate again).
import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Empty } from '@/components/ui';
import { GenerateButton } from '@/components/ui/GenerateButton';
import { Icon } from '@/components/ui/Icon';
import { HEADER_COLORS } from '@/features/reports/colors';
import { ExportDialog } from '@/features/reports/ExportDialog';
import { useLive } from '@/hooks/useLive';
import { fmtHeaderDate, fmtLong } from '@/lib/dates';
import type { Entry } from '@/lib/types';
import { deletePublication, listPublications, publicationEntries, type Publication } from '@/features/transmittal/api';
import { combinedColumns } from '../columns';
import { NOWRAP } from './shared';

export function WeeklyLists({ committeeName, canPublish }: { committeeName: (id: string | null | undefined) => string; canPublish: boolean }) {
  const pubs = useLive(listPublications, ['publications']);
  const [openId, setOpenId] = useState<string | null>(null);
  const [regen, setRegen] = useState<{ pub: Publication; rows: Entry[] } | null>(null);
  const items = useLive(() => (openId ? publicationEntries(openId) : Promise.resolve([])), ['publication_entries'], [openId]);
  const columns = useMemo(() => combinedColumns(committeeName), [committeeName]);
  const screenColumns = useMemo(() => columns.filter((c) => c.label !== 'TYPE'), [columns]);
  const reportColumns = useMemo(() => combinedColumns(committeeName, false).filter((c) => c.label !== 'TYPE'), [committeeName]);
  const [error, setError] = useState('');

  if (pubs.loading) return <div className="p-8 text-center text-sm text-muted">Loading…</div>;
  if (!pubs.data?.length) return <div className="card"><Empty>No weekly list has been published yet.</Empty></div>;

  return (
    <div className="space-y-3">
      {(error || pubs.error) && <Alert kind="error">{error || pubs.error}</Alert>}
      {pubs.data.map((p) => {
        const isOpen = openId === p.id;
        return (
          <div key={p.id} className="card">
            <div className="flex flex-wrap items-center gap-3 p-4">
              <button className="min-w-0 basis-full text-left sm:basis-0 sm:flex-1" onClick={() => setOpenId(isOpen ? null : p.id)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{p.title}</span>
                  <Badge color="green"><Icon name="globe" size={11} />Published</Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted">{p.covering} · published {fmtLong(p.published_on)} by {committeeName(p.committee_id) || 'admin'}</div>
              </button>
              <GenerateButton
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    setRegen({ pub: p, rows: await publicationEntries(p.id) });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }}
              />
              {canPublish && (
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => confirm(`Unpublish ${p.title}? The list is removed from Weekly published; the records themselves stay.`) && deletePublication(p.id).catch((e) => setError(e.message))}>
                  Unpublish
                </Button>
              )}
              <button className="text-muted" aria-label="Show records" onClick={() => setOpenId(isOpen ? null : p.id)}>{isOpen ? '▲' : '▼'}</button>
            </div>
            {isOpen && (
              <div className="border-t border-line">
                {items.loading ? (
                  <div className="p-6 text-center text-sm text-muted">Loading…</div>
                ) : (
                  <table className="stack-wide w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="bg-brand-50 text-left text-[11px] font-semibold uppercase text-brand-700">
                        <th className="w-[4%] px-1.5 py-2">#</th>
                        {screenColumns.map((c) => <th key={c.label} className="border-l border-line px-1.5 py-2">{c.label}</th>)}
                        <th className="border-l border-line px-1.5 py-2">Received by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(items.data ?? []).map((e, i) => (
                        <tr key={e.id} className="border-b border-line align-top">
                          <td className="px-1.5 py-1.5 text-muted">{i + 1}</td>
                          {screenColumns.map((c) => <td key={c.label} className={`${NOWRAP.test(c.label) ? 'whitespace-nowrap' : 'whitespace-pre-line'} border-l border-line px-1.5 py-1.5`}>{c.value(e)}</td>)}
                          <td className="break-words border-l border-line px-1.5 py-1.5 text-xs font-semibold text-brand-700">{e.received_by ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}
      {regen && (
        <ExportDialog
          open
          onClose={() => setRegen(null)}
          title={`Generate ${regen.pub.title}`}
          entries={regen.rows}
          columns={reportColumns}
          headerColor={HEADER_COLORS.blank.hex}
          headerText="#000000"
          initialDate={regen.pub.published_on}
          received={(e) => e.received_by ?? ''}
          receivedLabel="RECEIVED BY"
          receivedDefault
          makeHeader={(d) => ({
            code: `SP-PUBLISHED-${String(regen.pub.week_no ?? '').padStart(3, '0')}`,
            dateText: fmtHeaderDate(d),
            covering: regen.pub.covering ?? '',
            office: 'SANGGUNIANG PANLUNGSOD NG DASMARIÑAS',
            title: 'PUBLISHED SOLICITATION REQUESTS',
            week: regen.pub.week_no ?? 0,
          })}
        />
      )}
    </div>
  );
}
