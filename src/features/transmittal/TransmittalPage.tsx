'use client';
// Transmittal = live table for one type:
//   encode in the last row → Submit (done for the day) → Transmit (final, locked; shows in Published (All)).
// The checkbox = received by this office (its name appears in "Received by", saved) and also picks the rows to Generate / Transmit.
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Modal, PageHeader } from '@/components/ui';
import { GenerateButton } from '@/components/ui/GenerateButton';
import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/features/auth/session';
import { ExportDialog } from '@/features/reports/ExportDialog';
import { buildHeader } from '@/features/reports/header';
import { BulkScanDialog } from '@/features/scan/BulkScanDialog';
import { useLive } from '@/hooks/useLive';
import { useReorder } from '@/hooks/useReorder';
import { fmtLong, isoToUtc, ordinal, todayIso, utcToIso, weekNumber, weekStart } from '@/lib/dates';
import type { Entry, EntryInput, TransmittalType } from '@/lib/types';
import { deleteEntry, listEntries, listTransmittals, reorderEntries, setEntryStatus, setReceived, submitEntries, transmit } from './api';
import { TYPES } from './config';
import { EntryForm } from './EntryForm';
import { matches } from './EntryTable';
import { TransmittalSheet } from './TransmittalSheet';

type View = 'open' | 'week' | 'sent' | 'all';
const VIEWS: [View, string][] = [
  ['open', 'Not yet transmitted'],
  ['week', 'This week'],
  ['sent', 'Transmitted'],
  ['all', 'Everything'],
];

export function TransmittalPage({ type }: { type: TransmittalType }) {
  const cfg = TYPES[type];
  const { committee, profile } = useSession();
  const live = useLive(
    async () => {
      const [entries, tx] = await Promise.all([
        listEntries({ committeeId: committee?.id, type, status: ['draft', 'submitted', 'transmitted'] }),
        listTransmittals(committee?.id),
      ]);
      return { entries, tx };
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
  const [form, setForm] = useState<{ open: boolean; entry?: Entry | null; prefill?: EntryInput }>({ open: false });
  const [scanOpen, setScanOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirm, setConfirm] = useState<'submit' | 'transmit' | 'deleteAll' | null>(null);
  // Transmit asks for the week. One transmittal per week: transmitting again in that week adds to it.
  const [weekOf, setWeekOf] = useState(todayIso());
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Instant feedback while the database saves (ticks and order).
  const [tick, setTick] = useState<Record<string, boolean>>({});
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const isChecked = (e: Entry) => tick[e.id] ?? !!e.received_at;
  useEffect(() => setTick({}), [live.data]); // fresh data from the database wins

  const ordered = useMemo(() => {
    if (!localOrder) return all;
    const idx = new Map(localOrder.map((id, i) => [id, i]));
    return [...all].sort((a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9));
  }, [all, localOrder]);

  // Filter choices come from the rows themselves, with counts.
  const countBy = (key: (e: Entry) => string | null) => {
    const m = new Map<string, number>();
    all.forEach((e) => {
      const k = (key(e) ?? '').trim() || '(blank)';
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
  };
  const reqOf = (e: Entry) => (type === 'medical' ? e.purpose : e.request);
  const orgs = useMemo(() => countBy((e) => e.organization), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const brgys = useMemo(() => countBy((e) => e.barangay), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const reqs = useMemo(() => countBy(reqOf), [all, type]); // eslint-disable-line react-hooks/exhaustive-deps
  const is = (v: string | null, want: string) => !want || ((v ?? '').trim() || '(blank)') === want;

  const ws = weekStart();
  const rows = useMemo(
    () =>
      ordered.filter((e) => {
        if (view === 'open' && e.status === 'transmitted') return false;
        if (view === 'sent' && e.status !== 'transmitted') return false;
        if (view === 'week' && e.status === 'transmitted' && (transmittals.get(e.transmittal_id ?? '')?.transmitted_on ?? '') < ws) return false;
        if (!is(e.organization, org) || !is(e.barangay, brgy) || !is(reqOf(e), req)) return false;
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
    false, // rows move by typing a number in #
  );

  // Ticking = received by this office.
  const check = (ids: string[], on: boolean) => {
    setTick((t) => ({ ...t, ...Object.fromEntries(ids.map((id) => [id, on])) }));
    setReceived(ids, on, committee?.id ?? null).catch((err) => setNotice({ kind: 'error', text: err.message }));
  };

  const checkedRows = rows.filter(isChecked);
  const exportRows = checkedRows.length ? checkedRows : rows;
  const open = rows.filter((e) => e.status !== 'transmitted');
  const checkedOpen = open.filter(isChecked);
  const toTransmit = checkedOpen.length ? checkedOpen : open;
  const drafts = all.filter((e) => e.status === 'draft');
  const canEditSent = !!committee?.can_edit_published;
  const deletable = rows.filter((e) => e.status !== 'transmitted' || canEditSent);

  // Essential fields must be filled in before transmitting.
  const requiredFields = cfg.fields.filter((f) => f.required);
  const incomplete = (e: Entry) => requiredFields.filter((f) => !String((e as unknown as Record<string, unknown>)[f.key] ?? '').trim()).map((f) => f.label.split(' (')[0]);
  const notReady = toTransmit.filter((e) => incomplete(e).length);

  const remove = async (e: Entry) => {
    if (!window.confirm(`Delete the request of ${e.solicitor_name || e.patient_name || 'this row'}?`)) return;
    const p = e.status === 'transmitted' ? setEntryStatus([e.id], 'archived', 'Deleted from Transmittal') : deleteEntry(e.id);
    await p.catch((err) => setNotice({ kind: 'error', text: err.message }));
  };

  const shiftDays = (iso: string, n: number) => {
    const d = isoToUtc(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return utcToIso(d);
  };
  const wkStart = weekStart(weekOf);
  const wkEnd = shiftDays(wkStart, 6);
  const wkNo = weekNumber(weekOf);
  const today = todayIso();
  // the transmittal date: today when transmitting the current week, otherwise the last day of that week
  const transmitDate = today >= wkStart && today <= wkEnd ? today : wkEnd;
  const sameWeek = (live.data?.tx ?? []).find((t) => t.type === type && t.week_no === wkNo && t.transmitted_on.slice(0, 4) === transmitDate.slice(0, 4));
  const alreadyInWeek = sameWeek ? all.filter((e) => e.transmittal_id === sameWeek.id) : [];

  const run = async (what: 'submit' | 'transmit' | 'deleteAll') => {
    setBusy(true);
    try {
      if (what === 'submit') {
        const n = await submitEntries(type);
        setNotice({ kind: 'ok', text: `Submitted ${n} request(s) for today.` });
      } else if (what === 'transmit') {
        const header = buildHeader(type, committee, [...alreadyInWeek, ...toTransmit], transmitDate);
        await transmit({
          type,
          code: sameWeek?.code ?? header.code,
          week: wkNo,
          covering: header.covering,
          date: transmitDate,
          encoderName: profile.encoder_name ?? '',
          encoderPosition: profile.position ?? '',
          entryIds: toTransmit.map((e) => e.id),
        });
        setNotice({ kind: 'ok', text: `Transmitted ${toTransmit.length} request(s) for the ${ordinal(wkNo)} week (${sameWeek?.code ?? header.code}).` });
      } else {
        const sent = deletable.filter((e) => e.status === 'transmitted').map((e) => e.id);
        for (const e of deletable.filter((x) => x.status !== 'transmitted')) await deleteEntry(e.id);
        if (sent.length) await setEntryStatus(sent, 'archived', 'Deleted with "Delete all"');
        setNotice({ kind: 'ok', text: `Deleted ${deletable.length} request(s).${sent.length ? ' Transmitted ones were moved to Archived.' : ''}` });
      }
      setConfirm(null);
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
            <GenerateButton variant="secondary" disabled={!rows.length} count={checkedRows.length} onClick={() => setGenerating(true)} />
            <Button disabled={!drafts.length} onClick={() => setConfirm('submit')} title="Done encoding for today (still editable)"><Icon name="check" size={16} />Submit</Button>
            <Button className="bg-accent text-civic-900 hover:bg-accent/90" disabled={!open.length} onClick={() => { setWeekOf(todayIso()); setConfirm('transmit'); }} title="Done for the week: lock the requests">
              <Icon name="send" size={16} />Transmit
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
        <div className="grid grid-cols-2 items-center gap-2 border-b border-line p-3 sm:flex sm:flex-wrap">
          <select className="input col-span-2 sm:w-auto" value={view} onChange={(e) => setView(e.target.value as View)} aria-label="Show">
            {VIEWS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="input col-span-2 sm:w-auto sm:max-w-[200px]" value={org} onChange={(e) => setOrg(e.target.value)} aria-label="Organization">
            <option value="">All organizations</option>
            {orgs.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
          </select>
          <select className="input sm:w-auto sm:max-w-[170px]" value={brgy} onChange={(e) => setBrgy(e.target.value)} aria-label="Barangay">
            <option value="">All barangays</option>
            {brgys.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
          </select>
          <select className="input sm:w-auto sm:max-w-[170px]" value={req} onChange={(e) => setReq(e.target.value)} aria-label={type === 'medical' ? 'Purpose' : 'Request'}>
            <option value="">{type === 'medical' ? 'All purposes' : 'All requests'}</option>
            {reqs.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
          </select>
          <input className="input col-span-2 sm:w-40" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          {(org || brgy || req || q) && (
            <button className="text-xs text-brand-600 hover:underline" onClick={() => { setOrg(''); setBrgy(''); setReq(''); setQ(''); }}>Clear</button>
          )}
          <div className="col-span-2 flex items-center justify-between gap-3 sm:ml-auto sm:justify-end">
            <span className="text-xs text-muted">{rows.length} shown · {checkedRows.length} received</span>
            <Button size="sm" variant="ghost" className="text-red-600" disabled={!deletable.length} onClick={() => setConfirm('deleteAll')}>
              <Icon name="trash" size={14} />Delete all
            </Button>
          </div>
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
            transmittals={transmittals}
            onDetails={(e) => setForm({ open: true, entry: e })}
            onDelete={remove}
            onNotice={(kind, text) => setNotice({ kind, text })}
          />
        )}
      </div>

      <EntryForm type={type} open={form.open} entry={form.entry} prefill={form.prefill} onClose={() => setForm({ open: false })} />

      <BulkScanDialog open={scanOpen} type={type} onClose={() => setScanOpen(false)} onSaved={(n) => setNotice({ kind: 'ok', text: `Added ${n} scanned request(s). Please check them before you Submit.` })} />

      {/* Simple confirmations (no report is generated here) */}
      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'submit' ? 'Submit' : confirm === 'transmit' ? 'Transmit' : 'Delete all'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
            {confirm === 'submit' && <Button busy={busy} onClick={() => run('submit')}>Submit {drafts.length}</Button>}
            {confirm === 'transmit' && <Button busy={busy} disabled={notReady.length > 0} onClick={() => run('transmit')}>Transmit {toTransmit.length}</Button>}
            {confirm === 'deleteAll' && <Button variant="danger" busy={busy} onClick={() => run('deleteAll')}>Delete {deletable.length}</Button>}
          </>
        }
      >
        {confirm === 'submit' && (
          <p className="text-sm">
            You are about to submit <b>{drafts.length}</b> request(s). They appear in <b>Published (All)</b> for every office right away, and you can still
            edit them — submit as often as you like. At the end of the week, <b>Transmit</b> locks them.
          </p>
        )}
        {confirm === 'transmit' &&
          (notReady.length ? (
            <Alert kind="error">
              {notReady.length} request(s) are missing required fields:
              <ul className="mt-1 list-disc pl-5">
                {notReady.slice(0, 8).map((e) => (
                  <li key={e.id}>#{rows.findIndex((r) => r.id === e.id) + 1} {e.patient_name || e.solicitor_name || '(no name)'}: {incomplete(e).join(', ')}</li>
                ))}
              </ul>
            </Alert>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <span className="label">Which week is this for?</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setWeekOf(shiftDays(wkStart, -7))} aria-label="Previous week">‹</Button>
                  <input type="date" className="input w-auto" value={weekOf} onChange={(e) => e.target.value && setWeekOf(e.target.value)} aria-label="Any day of the week" />
                  <Button size="sm" variant="secondary" onClick={() => setWeekOf(shiftDays(wkStart, 7))} aria-label="Next week">›</Button>
                </div>
                <p className="mt-1 font-semibold">{ordinal(wkNo)} week · {fmtLong(wkStart)} – {fmtLong(wkEnd)}</p>
              </div>
              {sameWeek ? (
                <Alert kind="info">
                  This week was already transmitted as <b>{sameWeek.code}</b> ({alreadyInWeek.length} request(s)). These {toTransmit.length} will be <b>added to it</b> — still one transmittal for the week.
                </Alert>
              ) : null}
              <p>
                You are about to transmit {checkedOpen.length ? <>the <b>{toTransmit.length} ticked</b></> : <>all <b>{toTransmit.length}</b></>} request(s).
                Transmit means you are done for this week: they are <b>locked</b> and listed in History › Transmitted.
              </p>
            </div>
          ))}
        {confirm === 'deleteAll' && (
          <p className="text-sm">
            Delete all <b>{deletable.length}</b> request(s) shown in the table? Drafts are removed permanently; transmitted ones are moved to Archived.
          </p>
        )}
      </Modal>

      <ExportDialog
        open={generating}
        onClose={() => setGenerating(false)}
        title={`Generate ${cfg.label}`}
        entries={exportRows}
        columns={cfg.columns}
        headerColor={cfg.headerColor}
        headerText={cfg.headerText}
        initialDate={todayIso()}
        makeHeader={(d) => buildHeader(type, committee, exportRows, d)}
        intro={
          <Alert kind="info">
            {checkedRows.length ? <>Generating the <b>{checkedRows.length} ticked</b> row(s).</> : <>No rows are ticked, so all <b>{rows.length}</b> shown rows are included.</>}
          </Alert>
        }
      />
    </>
  );
}
