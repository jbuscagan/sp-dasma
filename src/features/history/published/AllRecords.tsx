'use client';
// Published (All) › All records: filter, arrange (drag a row), tick rows, Generate, Publish.
import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Empty, Field } from '@/components/ui';
import { GenerateButton } from '@/components/ui/GenerateButton';
import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/features/auth/session';
import { HEADER_COLORS } from '@/features/reports/colors';
import { ExportDialog } from '@/features/reports/ExportDialog';
import { useLive } from '@/hooks/useLive';
import { useReorder } from '@/hooks/useReorder';
import { fmtHeaderDate, fmtLong, todayIso } from '@/lib/dates';
import type { Entry, TransmittalType } from '@/lib/types';
import { getEntryOrder, listTransmittals, setEntryOrder, setEntryStatus } from '@/features/transmittal/api';
import { TYPE_ORDER, TYPES } from '@/features/transmittal/config';
import { EntryForm } from '@/features/transmittal/EntryForm';
import { matches } from '@/features/transmittal/EntryTable';
import { combinedColumns } from '../columns';
import { findIssues } from '../discrepancies';
import { FlagDialog } from '../FlagDialog';
import { useHistoryData } from '../useHistoryData';
import { NOWRAP } from './shared';
import { ChecksDialog } from './ChecksDialog';
import { PublishDialog } from './PublishDialog';

export function AllRecords({ canPublish, onPublished }: { canPublish: boolean; onPublished: () => void }) {
  const { committee, committees, committeeName, isAdmin } = useSession();
  const [type, setType] = useState<TransmittalType | ''>('');
  const [office, setOffice] = useState('');
  const [org, setOrg] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'' | 'issues' | 'flagged'>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [flagFor, setFlagFor] = useState<Entry | null>(null);
  const [checksFor, setChecksFor] = useState<Entry | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [exporting, setExporting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  const { entries, flags, error: loadError, loading } = useHistoryData(
    { status: 'transmitted', type: type || null, committeeId: office || null, from: from || undefined, to: to || undefined },
    [type, office, from, to],
  );
  const order = useLive(getEntryOrder, ['entry_order']);
  const tx = useLive(() => listTransmittals(), ['transmittals']);
  const revisionOpen = useMemo(() => new Set((tx.data ?? []).filter((t) => t.revision_open).map((t) => t.id)), [tx.data]);

  // My office's arrangement first, then everything else by date received.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const sorted = useMemo(() => {
    const pos = localOrder ? new Map(localOrder.map((id, i) => [id, i + 1])) : order.data ?? new Map<string, number>();
    return [...entries].sort((a, b) => {
      const pa = pos.get(a.id) ?? Infinity;
      const pb = pos.get(b.id) ?? Infinity;
      if (pa !== pb) return pa - pb;
      return a.date_received.localeCompare(b.date_received) || a.created_at.localeCompare(b.created_at);
    });
  }, [entries, order.data, localOrder]);

  const columns = useMemo(() => combinedColumns(committeeName), [committeeName]);
  // On screen: no TYPE column and no type under the office (it repeated on every row).
  const screenColumns = useMemo(() => columns.filter((c) => c.label !== 'TYPE'), [columns]);
  const issues = useMemo(() => findIssues(entries), [entries]);
  const orgs = useMemo(() => Array.from(new Set(entries.map((e) => (e.organization ?? '').trim()).filter(Boolean))).sort(), [entries]);

  const rows = useMemo(
    () =>
      sorted.filter((e) => {
        if (!matches(e, columns, q)) return false;
        if (org && (e.organization ?? '').trim() !== org) return false;
        if (only === 'issues') return issues.has(e.id);
        if (only === 'flagged') return (flags.get(e.id) ?? []).some((f) => f.status === 'open');
        return true;
      }),
    [sorted, columns, q, org, only, issues, flags],
  );

  const reorder = useReorder(
    sorted.map((e) => e.id),
    rows.map((e) => e.id),
    (ids) => {
      setLocalOrder(ids);
      setEntryOrder(ids).catch((e) => setError(e.message));
    },
    !!committee,
    true,
  );

  const chosen = rows.filter((e) => selected.has(e.id));
  const targetRows = chosen.length ? chosen : rows;
  const allOn = rows.length > 0 && rows.every((e) => selected.has(e.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Locked for everyone except admins, offices the admin allowed (own rows), or an admin-opened revision.
  const canChange = (e: Entry) =>
    isAdmin || (e.committee_id === committee?.id && (!!committee?.can_edit_published || (!!e.transmittal_id && revisionOpen.has(e.transmittal_id))));
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  return (
    <>
      {(loadError || error) && <div className="mb-3"><Alert kind="error">{loadError || error}</Alert></div>}

      <div className="card mb-4 grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-7">
        <Field label="Type">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as TransmittalType | '')}>
            <option value="">All types</option>
            {TYPE_ORDER.filter((t) => t !== 'personal').map((t) => <option key={t} value={t}>{TYPES[t].label}</option>)}
          </select>
        </Field>
        <Field label="Office">
          <select className="input" value={office} onChange={(e) => setOffice(e.target.value)}>
            <option value="">All offices</option>
            {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Organization">
          <select className="input" value={org} onChange={(e) => setOrg(e.target.value)}>
            <option value="">All organizations</option>
            {orgs.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Received from"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Received to"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Show">
          <select className="input" value={only} onChange={(e) => setOnly(e.target.value as typeof only)}>
            <option value="">Everything</option>
            <option value="issues">Possible discrepancies</option>
            <option value="flagged">With open remarks</option>
          </select>
        </Field>
        <Field label="Search" className="col-span-2 sm:col-span-1"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      </div>

      <div className="card min-w-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 text-sm">
          <Badge color="blue">{rows.length} record(s)</Badge>
          {issues.size > 0 && <Badge color="amber">{rows.filter((e) => issues.has(e.id)).length} to check</Badge>}
          {chosen.length > 0 && (
            <>
              <Badge color="green">{chosen.length} selected</Badge>
              <button className="text-xs text-brand-600 hover:underline" onClick={() => setSelected(new Set())}>Clear</button>
            </>
          )}
          <div className="ml-auto flex gap-2">
            <GenerateButton variant="secondary" disabled={!rows.length} count={chosen.length} onClick={() => setExporting(true)} />
            {canPublish && (
              <Button disabled={!rows.length} onClick={() => setPublishing(true)} title="Publish the weekly combined list of all offices">
                <Icon name="globe" size={16} />Publish
              </Button>
            )}
          </div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted">Loading…</div>
        ) : !rows.length ? (
          <Empty>No published records match these filters.</Empty>
        ) : (
          <table className="stack-wide w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-brand-50 text-left text-[11px] font-semibold uppercase leading-tight tracking-wide text-brand-700">
                <th className="w-8 px-1.5 py-2 text-center"><input type="checkbox" className="h-4 w-4 accent-brand-600" aria-label="Select all shown" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((e) => e.id)))} /></th>
                <th className="w-10 border-l border-line px-1.5 py-2 text-center">#</th>
                {screenColumns.map((c) => <th key={c.label} className="border-l border-line px-1.5 py-2">{c.label}</th>)}
                <th className="border-l border-line px-1.5 py-2">Received by</th>
                <th className="border-l border-line px-1.5 py-2" title="Possible discrepancies">Checks</th>
                <th className="border-l border-line" />
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => {
                const list = issues.get(e.id) ?? [];
                const openFlags = (flags.get(e.id) ?? []).filter((f) => f.status === 'open').length;
                const over = reorder.dragOver?.id === e.id;
                return (
                  <tr
                    key={e.id}
                    {...reorder.rowProps(e.id)}
                    className={`border-b border-line align-top ${selected.has(e.id) ? 'bg-brand-50/70' : openFlags ? 'bg-red-50/60 dark:bg-red-950/20' : ''} ${
                      over ? (reorder.dragOver?.after ? 'shadow-[inset_0_-3px_0_rgb(var(--brand-500))]' : 'shadow-[inset_0_3px_0_rgb(var(--brand-500))]') : ''
                    }`}
                  >
                    <td className="px-1.5 py-2 text-center"><input type="checkbox" className="h-4 w-4 accent-brand-600" aria-label="Select row" checked={selected.has(e.id)} onChange={() => toggle(e.id)} /></td>
                    <td className="border-l border-line px-1.5 py-1.5 text-center tabular-nums text-muted">{i + 1}</td>
                    {screenColumns.map((c) => <td key={c.label} className={`${NOWRAP.test(c.label) ? 'whitespace-nowrap' : 'whitespace-pre-line'} border-l border-line px-1.5 py-1.5`}>{c.value(e)}</td>)}
                    <td className="break-words border-l border-line px-1.5 py-1.5 text-xs font-semibold text-brand-700" title={e.received_at ? fmtLong(e.received_at) : undefined}>{e.received_by ?? ''}</td>
                    <td className="border-l border-line px-1 py-1.5 text-center">
                      {list.length || openFlags ? (
                        <button className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-amber-600 hover:bg-amber-50" onClick={() => setChecksFor(e)} title="See what to check">
                          <Icon name="alert" size={15} />
                          <span className="text-[11px] font-semibold">{list.length + openFlags}</span>
                        </button>
                      ) : null}
                    </td>
                    <td className="border-l border-line px-0.5 py-1 text-right">
                      <div className="flex flex-wrap justify-end">
                        <button className="rounded-md p-1 text-muted hover:bg-brand-50 hover:text-brand-600" onClick={() => setFlagFor(e)} title="Remarks" aria-label="Remarks"><Icon name="flag" size={15} /></button>
                        {canChange(e) ? (
                          <>
                            <button className="rounded-md p-1 text-muted hover:bg-brand-50 hover:text-brand-600" onClick={() => setEditing(e)} title="Edit" aria-label="Edit"><Icon name="pencil" size={15} /></button>
                            <button
                              className="rounded-md p-1 text-muted hover:bg-red-50 hover:text-red-600"
                              title="Delete (moves to Archived)"
                              aria-label="Delete"
                              onClick={() => {
                                const reason = prompt('Delete this record? It moves to History › Archived (can be restored). Reason:');
                                if (reason !== null) setEntryStatus([e.id], 'archived', reason || 'Deleted from Published').catch((err) => setError(err.message));
                              }}
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          </>
                        ) : (
                          <span className="p-1 text-muted" title="Locked. Ask the administrator for permission to edit published records."><Icon name="lock" size={14} /></span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ChecksDialog entry={checksFor} issues={checksFor ? issues.get(checksFor.id) ?? [] : []} byId={byId} openFlags={checksFor ? (flags.get(checksFor.id) ?? []).filter((f) => f.status === 'open').length : 0} onRemarks={(e) => { setChecksFor(null); setFlagFor(e); }} onClose={() => setChecksFor(null)} />
      <FlagDialog entry={flagFor} flags={flagFor ? flags.get(flagFor.id) ?? [] : []} onClose={() => setFlagFor(null)} />
      {editing && <EntryForm type={editing.type} open entry={editing} onClose={() => setEditing(null)} />}
      <ExportDialog
        open={exporting}
        onClose={() => setExporting(false)}
        title="Generate published records"
        entries={targetRows}
        columns={columns}
        headerColor={HEADER_COLORS.blank.hex}
        headerText="#000000"
        initialDate={todayIso()}
        received={(e) => e.received_by ?? ''}
        intro={<Alert kind="info">{chosen.length ? <>Generating the <b>{chosen.length} selected</b> record(s).</> : <>No rows are selected, so all <b>{rows.length}</b> shown records are included.</>}</Alert>}
        makeHeader={(d) => ({
          code: 'SP-PUBLISHED',
          dateText: fmtHeaderDate(d),
          covering: from || to ? `(${from || '…'} to ${to || '…'})` : '',
          office: 'SANGGUNIANG PANLUNGSOD NG DASMARIÑAS',
          title: `PUBLISHED SOLICITATION REQUESTS${type ? ' – ' + TYPES[type].label.toUpperCase() : ''}`,
          week: 0,
        })}
      />
      {publishing && (
        <PublishDialog
          rows={targetRows}
          selectedCount={chosen.length}
          onClose={() => setPublishing(false)}
          onDone={() => {
            setPublishing(false);
            setSelected(new Set());
            onPublished();
          }}
        />
      )}
    </>
  );
}
