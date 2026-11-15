'use client';
import { Icon } from '@/components/ui/Icon';
import { GenerateButton } from '@/components/ui/GenerateButton';
// History › Transmitted (own): every weekly publication of my office, with lock / revision controls.
import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Empty, PageHeader } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { ExportDialog } from '@/features/reports/ExportDialog';
import { officeLine } from '@/features/reports/header';
import { fmtHeaderDate, fmtLong } from '@/lib/dates';
import { useLive } from '@/hooks/useLive';
import type { Entry, Transmittal, TransmittalType } from '@/lib/types';
import { listTransmittals, recallTransmittal, requestRevision, setRevisionOpen } from '@/features/transmittal/api';
import { TYPE_ORDER, TYPES } from '@/features/transmittal/config';
import { EntryTable } from '@/features/transmittal/EntryTable';
import { FlagDialog } from './FlagDialog';
import { useHistoryData } from './useHistoryData';

export function LockBadge({ t }: { t: Transmittal }) {
  if (t.revision_open) return <Badge color="amber"><Icon name="pencil" size={11} />Revision open</Badge>;
  if (t.revision_requested_at) return <Badge color="blue"><Icon name="clock" size={11} />Revision requested</Badge>;
  return <Badge color="green"><Icon name="lock" size={11} />Locked</Badge>;
}

export function OwnHistory() {
  const { committee, isAdmin } = useSession();
  const [type, setType] = useState<TransmittalType | ''>('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [regen, setRegen] = useState<Transmittal | null>(null);
  const [flagFor, setFlagFor] = useState<Entry | null>(null);
  const [error, setError] = useState('');

  const tx = useLive(() => listTransmittals(committee?.id), ['transmittals'], [committee?.id]);
  const { entries, flags, error: loadError } = useHistoryData({ committeeId: committee?.id, status: 'transmitted' }, [committee?.id]);

  const byTx = useMemo(() => {
    const m = new Map<string, Entry[]>();
    entries.forEach((e) => e.transmittal_id && m.set(e.transmittal_id, [...(m.get(e.transmittal_id) ?? []), e]));
    return m;
  }, [entries]);

  const run = (p: Promise<unknown>) => p.catch((e) => setError(e instanceof Error ? e.message : String(e)));
  const list = (tx.data ?? []).filter((t) => !type || t.type === type);

  return (
    <>
      <PageHeader title="Transmitted (own)" subtitle={`Weekly publications of ${committee?.name ?? 'your office'}. Published records are locked; request a revision if something must change.`} />
      {(error || loadError || tx.error) && <div className="mb-3"><Alert kind="error">{error || loadError || tx.error}</Alert></div>}

      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" variant={type === '' ? 'primary' : 'secondary'} onClick={() => setType('')}>All</Button>
        {TYPE_ORDER.map((t) => (
          <Button key={t} size="sm" variant={type === t ? 'primary' : 'secondary'} onClick={() => setType(t)}>{TYPES[t].label}</Button>
        ))}
      </div>

      {!list.length && <div className="card"><Empty>Nothing published yet.</Empty></div>}

      <div className="space-y-3">
        {list.map((t) => {
          const items = byTx.get(t.id) ?? [];
          const receivedCount = items.filter((e) => e.received_at).length;
          const isOpen = openId === t.id;
          return (
            <div key={t.id} className="card">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <button className="min-w-0 basis-full text-left sm:basis-0 sm:flex-1" onClick={() => setOpenId(isOpen ? null : t.id)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold">{t.code}</span>
                    <Badge color="blue">{TYPES[t.type].label}</Badge>
                    <LockBadge t={t} />
                    <Badge color={receivedCount === items.length && items.length ? 'green' : 'gray'}>{receivedCount}/{items.length} received</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    Published {fmtLong(t.transmitted_on)} · Covering {t.covering} · by {t.encoder_name || '—'}
                    {t.revision_requested_at && !t.revision_open && <> · Revision reason: “{t.revision_reason}”</>}
                  </div>
                </button>
                <GenerateButton size="sm" variant="secondary" onClick={() => setRegen(t)} />
                {t.revision_open ? (
                  <Button size="sm" onClick={() => run(setRevisionOpen(t.id, false))} title="Done with changes — lock it again"><Icon name="lock" size={14} />Lock again</Button>
                ) : isAdmin ? (
                  <Button size="sm" variant="secondary" onClick={() => run(setRevisionOpen(t.id, true))}>Allow revision</Button>
                ) : !t.revision_requested_at ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const reason = prompt('What needs to be corrected? (sent to the administrator)');
                      if (reason) run(requestRevision(t.id, reason));
                    }}
                  >
                    Request revision
                  </Button>
                ) : null}
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => confirm(`Un-publish ${t.code}? Its ${items.length} request(s) go back to drafts.`) && run(recallTransmittal(t.id))}
                  >
                    Un-publish
                  </Button>
                )}
                <button className="text-sm text-muted" aria-label="Show requests" onClick={() => setOpenId(isOpen ? null : t.id)}>{isOpen ? '▲' : '▼'}</button>
              </div>
              {t.revision_open && (
                <div className="border-t border-line px-4 py-2">
                  <Alert kind="warn">Revision is open: edit these requests on the {TYPES[t.type].label} transmittal page (Show → Published), then click <b>Lock again</b>.</Alert>
                </div>
              )}
              {isOpen && (
                <div className="border-t border-line">
                  <EntryTable
                    entries={items}
                    columns={TYPES[t.type].columns}
                    extra={[
                      {
                        header: 'Received',
                        cell: (e) => (e.received_at ? <span className="text-xs font-semibold text-brand-700">{e.received_by || 'Received'}<br /><span className="font-normal text-muted">{fmtLong(e.received_at)}</span></span> : <span className="text-xs text-muted">—</span>),
                      },
                    ]}
                    actions={(e) => {
                      const open = (flags.get(e.id) ?? []).filter((f) => f.status === 'open').length;
                      return (
                        <Button size="sm" variant="ghost" onClick={() => setFlagFor(e)}>
                          Remarks{open ? ` (${open})` : ''}
                        </Button>
                      );
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <FlagDialog entry={flagFor} flags={flagFor ? flags.get(flagFor.id) ?? [] : []} onClose={() => setFlagFor(null)} />
      {regen && (
        <ExportDialog
          open
          onClose={() => setRegen(null)}
          title={`Generate ${regen.code}`}
          entries={byTx.get(regen.id) ?? []}
          columns={TYPES[regen.type].columns}
          headerColor={TYPES[regen.type].headerColor}
          headerText={TYPES[regen.type].headerText}
          initialDate={regen.transmitted_on}
          makeHeader={(d) => ({
            code: regen.code,
            dateText: fmtHeaderDate(d),
            covering: regen.covering ?? '',
            office: officeLine(committee),
            title: TYPES[regen.type].title,
            week: regen.week_no ?? 0,
          })}
          received={(e) => (e.received_at ? fmtLong(e.received_at) : '')}
        />
      )}
    </>
  );
}
