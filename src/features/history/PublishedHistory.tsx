'use client';
import { GenerateButton } from '@/components/ui/GenerateButton';
// Published: the weekly-finalized requests of every office.
// Each office can arrange the list its own way (drag ⋮⋮ or type a number); exports follow that order.
import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Field, PageHeader } from '@/components/ui';
import { PositionCell } from '@/components/ui/PositionCell';
import { useSession } from '@/features/auth/session';
import { ExportDialog } from '@/features/reports/ExportDialog';
import { useLive } from '@/hooks/useLive';
import { useReorder } from '@/hooks/useReorder';
import { fmtHeaderDate, todayIso } from '@/lib/dates';
import type { Entry, TransmittalType } from '@/lib/types';
import { getEntryOrder, listTransmittals, setEntryOrder, setEntryStatus } from '@/features/transmittal/api';
import { TYPE_ORDER, TYPES } from '@/features/transmittal/config';
import { EntryForm } from '@/features/transmittal/EntryForm';
import { EntryTable, matches } from '@/features/transmittal/EntryTable';
import { combinedColumns } from './columns';
import { findIssues } from './discrepancies';
import { FlagDialog } from './FlagDialog';
import { useHistoryData } from './useHistoryData';

export function PublishedHistory() {
  const { committee, committees, committeeName, isAdmin } = useSession();
  const [type, setType] = useState<TransmittalType | ''>('');
  const [office, setOffice] = useState('');
  const [org, setOrg] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'' | 'issues' | 'flagged'>('');
  const [flagFor, setFlagFor] = useState<Entry | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [exporting, setExporting] = useState(false);
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
  // On screen, show the type under the office name to keep the table narrow (exports keep both columns).
  const screenColumns = useMemo(
    () =>
      columns
        .filter((c) => c.label !== 'TYPE')
        .map((c) => (c.label === 'OFFICE' ? { ...c, label: 'OFFICE / TYPE', value: (e: Entry) => `${committeeName(e.committee_id)}\n${TYPES[e.type].label}` } : c)),
    [columns, committeeName],
  );
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
  );

  // Published rows are locked: only admins, or the owner while an admin has opened a revision, may change them.
  // Published rows are locked. Allowed: admins; offices the admin gave "Edit / delete published"
  // (their own rows only); or the owner while an admin has opened a revision. The database enforces the same rule.
  const canChange = (e: Entry) =>
    isAdmin ||
    (e.committee_id === committee?.id && (!!committee?.can_edit_published || (!!e.transmittal_id && revisionOpen.has(e.transmittal_id))));

  return (
    <>
      <PageHeader
        title="Published transmittals"
        subtitle="Requests finalized for the week by every committee. Drag ⋮⋮ or type a number to arrange the list for your office; exports follow your order."
        actions={<GenerateButton disabled={!rows.length} onClick={() => setExporting(true)} />}
      />
      {(loadError || error) && <div className="mb-3"><Alert kind="error">{loadError || error}</Alert></div>}

      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-3 lg:grid-cols-7">
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
        <Field label="Search"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, number…" /></Field>
      </div>

      <div className="card min-w-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 text-sm">
          <Badge color="blue">{rows.length} request(s)</Badge>
          <Badge color="amber">{rows.filter((e) => issues.has(e.id)).length} possible discrepancies</Badge>
          <Badge color="red">{rows.filter((e) => (flags.get(e.id) ?? []).some((f) => f.status === 'open')).length} open remarks</Badge>
          {localOrder || (order.data?.size ?? 0) > 0 ? (
            <button
              className="ml-auto text-xs text-brand-600 hover:underline"
              onClick={() => {
                const ids = [...entries].sort((x, y) => x.date_received.localeCompare(y.date_received) || x.created_at.localeCompare(y.created_at)).map((e) => e.id);
                setLocalOrder(ids);
                setEntryOrder(ids).catch((err) => setError(err.message));
              }}
            >
              Reset to date order
            </button>
          ) : null}
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted">Loading…</div>
        ) : (
          <EntryTable
            entries={rows}
            columns={screenColumns}
            dense
            reorder={reorder}
            empty="No published requests match these filters."
            rowClass={(e) => ((flags.get(e.id) ?? []).some((f) => f.status === 'open') ? 'bg-red-50/60 dark:bg-red-950/20' : '')}
            extra={[
              {
                header: 'Checks',
                cell: (e) => {
                  const open = (flags.get(e.id) ?? []).filter((f) => f.status === 'open').length;
                  const list = issues.get(e.id) ?? [];
                  if (!list.length && !open) return <span className="text-xs text-muted">—</span>;
                  return (
                    <div className="flex flex-col gap-1">
                      {list.map((i) => (
                        <Badge key={i.kind} color="amber" title={i.text}>⚠ {i.kind === 'contact-mismatch' ? 'Number mismatch' : 'Multiple offices'}</Badge>
                      ))}
                      {open > 0 && <Badge color="red">⚑ {open} remark(s)</Badge>}
                    </div>
                  );
                },
              },
            ]}
            actions={(e) => (
              <div className="flex flex-col items-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setFlagFor(e)}>Remarks</Button>
                {canChange(e) ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>Edit</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      onClick={() => {
                        const reason = prompt('Delete this record? It moves to History › Archived (can be restored). Reason:');
                        if (reason !== null) setEntryStatus([e.id], 'archived', reason || 'Deleted from Published').catch((err) => setError(err.message));
                      }}
                    >
                      Delete
                    </Button>
                  </>
                ) : (
                  <span className="text-[11px] text-muted" title="Published records are locked. Ask the administrator for “Edit / delete published” permission, or request a revision in History › Transmitted.">🔒 Locked</span>
                )}
              </div>
            )}
          />
        )}
      </div>

      <FlagDialog entry={flagFor} flags={flagFor ? flags.get(flagFor.id) ?? [] : []} onClose={() => setFlagFor(null)} />
      {editing && <EntryForm type={editing.type} open entry={editing} onClose={() => setEditing(null)} />}
      <ExportDialog
        open={exporting}
        onClose={() => setExporting(false)}
        title="Generate published requests report"
        entries={rows}
        columns={columns}
        headerColor="#cfe2f3"
        headerText="#000000"
        initialDate={todayIso()}
        makeHeader={(d) => ({
          code: 'SP-PUBLISHED',
          dateText: fmtHeaderDate(d),
          covering: from || to ? `(${from || '…'} to ${to || '…'})` : '',
          office: 'SANGGUNIANG PANLUNGSOD NG DASMARIÑAS',
          title: `PUBLISHED SOLICITATION REQUESTS${type ? ' – ' + TYPES[type].label.toUpperCase() : ''}`,
          week: 0,
        })}
      />
    </>
  );
}
