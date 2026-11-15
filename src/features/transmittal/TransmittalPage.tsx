'use client';
// Transmittal = live table for one type:
//   encode in the last row → Submit (done for the day) → Publish (finalized for the week, locked).
// The checkbox beside # means "received" (fills "Received by" with your name, saved) and also picks the rows to Generate / Publish.
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Modal, PageHeader } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/features/auth/session';
import { ExportDialog } from '@/features/reports/ExportDialog';
import { buildHeader } from '@/features/reports/header';
import { useLive } from '@/hooks/useLive';
import { useReorder } from '@/hooks/useReorder';
import { fmtMDY, todayIso, weekStart } from '@/lib/dates';
import type { Entry, EntryInput, TransmittalType } from '@/lib/types';
import { deleteEntry, listEntries, listTransmittals, reorderEntries, setReceived, setReceivedBy, submitEntries, transmit } from './api';
import { GenerateButton } from '@/components/ui/GenerateButton';
import { supabase } from '@/lib/supabase/client';
import { TYPES } from './config';
import { EntryForm } from './EntryForm';
import { matches } from './EntryTable';
import { BulkScanDialog } from '@/features/scan/BulkScanDialog';
import { TransmittalSheet } from './TransmittalSheet';

type View = 'open' | 'week' | 'published' | 'all';
const VIEWS: [View, string][] = [
  ['open', 'Not yet published'],
  ['week', 'This week'],
  ['published', 'Published'],
  ['all', 'Everything'],
];

export function TransmittalPage({ type }: { type: TransmittalType }) {
  const cfg = TYPES[type];
  const { committee, profile } = useSession();
  const live = useLive(
    async () => {
      const [entries, tx, people, staff] = await Promise.all([
        listEntries({ committeeId: committee?.id, type, status: ['draft', 'submitted', 'transmitted'] }),
        listTransmittals(committee?.id),
        committee ? supabase().from('profiles').select('encoder_name').eq('committee_id', committee.id) : Promise.resolve({ data: [] }),
        committee ? supabase().from('employees').select('name').eq('committee_id', committee.id) : Promise.resolve({ data: [] }),
      ]);
      // Suggestions for "Received by": encoders and employees of this office + names used before.
      const names = new Set<string>();
      (people.data ?? []).forEach((p: { encoder_name: string | null }) => p.encoder_name && names.add(p.encoder_name));
      (staff.data ?? []).forEach((p: { name: string }) => names.add(p.name));
      entries.forEach((e) => e.received_by && names.add(e.received_by));
      return { entries, tx, names: Array.from(names).sort() };
    },
    ['entries', 'transmittals'],
    [committee?.id, type],
  );
  const all = useMemo(() => live.data?.entries ?? [], [live.data]);
  const transmittals = useMemo(() => new Map((live.data?.tx ?? []).map((t) => [t.id, t])), [live.data]);

  const [view, setView] = useState<View>('open');
  const [org, setOrg] = useState('');
  const [brgy, setBrgy] = useState('');
  const [req, setReq] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<{ open: boolean; entry?: Entry | null; prefill?: EntryInput; scanText?: string }>({ open: false });
  const [scanOpen, setScanOpen] = useState(false);
  const [dialog, setDialog] = useState<'publish' | 'export' | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Instant feedback while the database saves (ticks and order).
  const [tick, setTick] = useState<Record<string, boolean>>({});
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const isChecked = (e: Entry) => tick[e.id] ?? !!e.received_at;
  useEffect(() => setTick({}), [live.data]); // fresh data from the database wins (e.g. another encoder un-ticked)

  const ordered = useMemo(() => {
    if (!localOrder) return all;
    const idx = new Map(localOrder.map((id, i) => [id, i]));
    return [...all].sort((a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9));
  }, [all, localOrder]);

  const ws = weekStart();
  // Filter choices come from the rows themselves, with counts.
  const countBy = (key: (e: Entry) => string | null) => {
    const m = new Map<string, number>();
    all.forEach((e) => {
      const k = (key(e) ?? '').trim() || '(blank)';
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
  };
  const orgs = useMemo(() => countBy((e) => e.organization), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const brgys = useMemo(() => countBy((e) => e.barangay), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const reqs = useMemo(() => countBy((e) => (type === 'medical' ? e.purpose : e.request)), [all, type]); // eslint-disable-line react-hooks/exhaustive-deps
  const is = (v: string | null, want: string) => !want || ((v ?? '').trim() || '(blank)') === want;

  const rows = useMemo(
    () =>
      ordered.filter((e) => {
        if (view === 'open' && e.status === 'transmitted') return false;
        if (view === 'published' && e.status !== 'transmitted') return false;
        if (view === 'week' && e.status === 'transmitted' && (transmittals.get(e.transmittal_id ?? '')?.transmitted_on ?? '') < ws) return false;
        if (!is(e.organization, org) || !is(e.barangay, brgy) || !is(type === 'medical' ? e.purpose : e.request, req)) return false;
        return matches(e, cfg.columns, q);
      }),
    [ordered, view, org, brgy, req, q, cfg.columns, transmittals, ws, type], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const reorder = useReorder(
    ordered.map((e) => e.id),
    rows.map((e) => e.id),
    (order) => {
      setLocalOrder(order);
      reorderEntries(order).catch((err) => setNotice({ kind: 'error', text: err.message }));
    },
    false, // no dragging — rows move by typing a number in #
  );

  // Ticking = received by me (the name can then be changed in "Received by").
  const check = (ids: string[], on: boolean) => {
    setTick((t) => ({ ...t, ...Object.fromEntries(ids.map((id) => [id, on])) }));
    const unnamed = ids.filter((id) => !all.find((e) => e.id === id)?.received_by);
    const named = ids.filter((id) => !unnamed.includes(id));
    Promise.all([
      setReceived(on ? unnamed : ids, on, on ? profile.encoder_name ?? null : undefined),
      on ? setReceived(named, true) : Promise.resolve(),
    ]).catch((err) => setNotice({ kind: 'error', text: err.message }));
  };

  const checkedRows = rows.filter(isChecked);
  const exportRows = checkedRows.length ? checkedRows : rows;
  const unpublished = rows.filter((e) => e.status !== 'transmitted');
  const checkedUnpublished = unpublished.filter(isChecked);
  const toPublish = checkedUnpublished.length ? checkedUnpublished : unpublished;
  const drafts = all.filter((e) => e.status === 'draft');

  // Essential fields must be filled in before publishing.
  const requiredFields = cfg.fields.filter((f) => f.required);
  const incomplete = (e: Entry) => requiredFields.filter((f) => !String((e as unknown as Record<string, unknown>)[f.key] ?? '').trim()).map((f) => f.label);
  const notReady = toPublish.filter((e) => incomplete(e).length);

  const remove = async (e: Entry) => {
    if (!confirm(`Delete the request of ${e.solicitor_name || e.patient_name}? This cannot be undone.`)) return;
    await deleteEntry(e.id).catch((err) => setNotice({ kind: 'error', text: err.message }));
  };

  const submitToday = async () => {
    setBusy(true);
    try {
      const n = await submitEntries(type);
      setNotice({ kind: 'ok', text: `Submitted ${n} request(s) for today.` });
      setConfirmSubmit(false);
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={cfg.label}
        subtitle={committee?.name}
        actions={
          <>
            <Button variant="secondary" onClick={() => setScanOpen(true)}><Icon name="upload" size={16} />Upload &amp; scan</Button>
            <GenerateButton variant="secondary" disabled={!rows.length} count={checkedRows.length} onClick={() => setDialog('export')} />
            <Button disabled={!drafts.length} onClick={() => setConfirmSubmit(true)} title="Done encoding for today (still editable)"><Icon name="check" size={16} />Submit</Button>
            <Button className="bg-accent text-civic-900 hover:bg-accent/90" disabled={!unpublished.length} onClick={() => setDialog('publish')} title="Finalize for the week (locks the records)">
              <Icon name="lock" size={16} />Publish
            </Button>
          </>
        }
      />

      {notice && (
        <div className="mb-3">
          <Alert kind={notice.kind}>
            {notice.text} <button className="ml-2 text-xs underline" onClick={() => setNotice(null)}>Dismiss</button>
          </Alert>
        </div>
      )}
      {live.error && <div className="mb-3"><Alert kind="error">{live.error}</Alert></div>}

      <div className="card min-w-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <select className="input w-auto" value={view} onChange={(e) => setView(e.target.value as View)} aria-label="Show">
            {VIEWS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="input w-auto max-w-[220px]" value={org} onChange={(e) => setOrg(e.target.value)} aria-label="Organization">
            <option value="">All organizations</option>
            {orgs.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
          </select>
          <select className="input w-auto max-w-[180px]" value={brgy} onChange={(e) => setBrgy(e.target.value)} aria-label="Barangay">
            <option value="">All barangays</option>
            {brgys.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
          </select>
          <select className="input w-auto max-w-[180px]" value={req} onChange={(e) => setReq(e.target.value)} aria-label={type === 'medical' ? 'Purpose' : 'Request'}>
            <option value="">{type === 'medical' ? 'All purposes' : 'All requests'}</option>
            {reqs.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
          </select>
          {(org || brgy || req) && (
            <button className="text-xs text-brand-600 hover:underline" onClick={() => { setOrg(''); setBrgy(''); setReq(''); }}>Clear filters</button>
          )}
          <input className="input w-44" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <span className="ml-auto text-xs text-muted">
            {rows.length} shown · <b className="text-brand-700">{checkedRows.length} ✓ received</b>
          </span>
        </div>
        {live.loading ? (
          <div className="p-8 text-center text-sm text-muted">Loading…</div>
        ) : (
          <TransmittalSheet
            type={type}
            rows={rows}
            reorder={reorder}
            isChecked={isChecked}
            onCheck={check}
            receiverNames={live.data?.names ?? []}
            onReceiverChange={(e, name) => setReceivedBy(e.id, name).catch((err) => setNotice({ kind: 'error', text: err.message }))}
            transmittals={transmittals}
            onDetails={(e) => setForm({ open: true, entry: e })}
            onDelete={remove}
            onNotice={(kind, text) => setNotice({ kind, text })}
          />
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        ✓ = received (your name goes to “Received by”) and included in Generate / Publish · type a number in # to move a row · ● submitted · 🔒 published · Enter on the last row saves it and starts a new one
      </p>

      <EntryForm type={type} open={form.open} entry={form.entry} prefill={form.prefill} scanText={form.scanText} onClose={() => setForm({ open: false })} />

      <BulkScanDialog open={scanOpen} type={type} onClose={() => setScanOpen(false)} onSaved={(n) => setNotice({ kind: 'ok', text: `Added ${n} scanned request(s) as drafts. Please check them before you Submit.` })} />

      <Modal
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        title="Submit"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmSubmit(false)}>Cancel</Button>
            <Button busy={busy} onClick={submitToday}>Submit {drafts.length} request(s)</Button>
          </>
        }
      >
        <p className="text-sm">
          Marks your <b>{drafts.length}</b> draft request(s) as <b>submitted for today</b>. You can still edit them until you <b>Publish</b> at the end of the week.
        </p>
      </Modal>

      <ExportDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === 'publish' ? `Publish ${cfg.label}` : `Generate ${cfg.label} report`}
        confirmLabel={dialog === 'publish' ? 'Publish, lock & generate' : 'Generate'}
        entries={dialog === 'publish' ? toPublish : exportRows}
        columns={cfg.columns}
        headerColor={cfg.headerColor}
        headerText={cfg.headerText}
        initialDate={todayIso()}
        makeHeader={(d) => buildHeader(type, committee, dialog === 'publish' ? toPublish : exportRows, d)}
        received={(e) => (e.received_at ? fmtMDY(e.received_at.slice(0, 10)) : '')}
        intro={
          dialog === 'publish' && notReady.length ? (
            <Alert kind="error">
              {notReady.length} request(s) are missing required fields — fill them in first:
              <ul className="mt-1 list-disc pl-5">
                {notReady.slice(0, 8).map((e) => (
                  <li key={e.id}>
                    #{rows.findIndex((r) => r.id === e.id) + 1} {e.patient_name || e.solicitor_name || '(no name)'}: {incomplete(e).join(', ')}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : dialog === 'publish' ? (
            <Alert kind="warn">
              Publishing finalizes {checkedUnpublished.length ? <b>the {toPublish.length} ticked</b> : <b>all {toPublish.length}</b>} request(s) for the week. They appear
              in <b>Published</b> for all offices and become <b>locked</b>.
            </Alert>
          ) : (
            <Alert kind="info">
              {checkedRows.length ? <>Exporting the <b>{checkedRows.length} ticked</b> row(s).</> : <>No rows are ticked, so all <b>{rows.length}</b> shown rows are exported.</>} Rows print in
              the order shown.
            </Alert>
          )
        }
        beforeExport={
          dialog === 'publish'
            ? async ({ header, transmitDate, encoderName, encoderPosition }) => {
                if (notReady.length) throw new Error('Fill in the required fields first (see the list above).');
                await transmit({ type, code: header.code, week: header.week, covering: header.covering, date: transmitDate, encoderName, encoderPosition, entryIds: toPublish.map((e) => e.id) });
                setNotice({ kind: 'ok', text: `Published and locked ${toPublish.length} request(s) as ${header.code}.` });
              }
            : undefined
        }
      />
    </>
  );
}
