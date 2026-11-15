'use client';
import { Icon } from '@/components/ui/Icon';
// Weekly solicitation monitoring: only the APPROVED organizations that an SPM / BM will give money to.
// Rows come from published requests, manual typing, or an uploaded/scanned letter.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Empty, Field, Modal } from '@/components/ui';
import { Combobox } from '@/components/ui/Combobox';
import { EventDateInput } from '@/components/ui/EventDateInput';
import { GenerateButton } from '@/components/ui/GenerateButton';
import { useDirectory } from '@/features/directory/useDirectory';
import { useSession } from '@/features/auth/session';
import { ExportDialog } from '@/features/reports/ExportDialog';
import { PreviewDialog } from '@/features/reports/PreviewDialog';
import { buildReport } from '@/features/reports/build';
import { renderReport } from '@/features/reports/export';
import { AttachmentList } from '@/features/transmittal/Attachments';
import { BulkScanDialog } from '@/features/scan/BulkScanDialog';
import { listEntries } from '@/features/transmittal/api';
import { displayName, orgBarangay, TYPES, type ColumnDef } from '@/features/transmittal/config';
import { useLive } from '@/hooks/useLive';
import { fmtLong, isoToUtc, ordinal, todayIso, weekNumber } from '@/lib/dates';
import type { Entry, TransmittalType } from '@/lib/types';
import { deleteBatch, deleteItem, listBatches, listItems, saveBatch, saveItem, uploadBudgetAttachment, type MonitoringBatch, type MonitoringItem } from './api';
import { MoneyInput } from './ContributionTab';
import { peso } from './money';

export const CATEGORIES = ['CSO', 'SK', 'BRGY', 'MEDICAL', 'OTHER'] as const;
export const CATEGORY_LABEL: Record<string, string> = { CSO: 'CSO', SK: 'SK', BRGY: 'Brgy', MEDICAL: 'Medical', OTHER: 'Others' };
const CATEGORY_TYPES: Record<string, TransmittalType[]> = {
  CSO: ['ngo', 'christmas'],
  SK: ['sk'],
  BRGY: ['barangay'],
  MEDICAL: ['medical'],
  OTHER: ['ngo', 'christmas', 'barangay', 'sk', 'medical'],
};
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');

/** "(44th | Nov 03 - 05, 2026)" like the sample. */
export function monitoringCovering(from: string, to: string) {
  const a = isoToUtc(from);
  const b = isoToUtc(to);
  const left = `${SHORT[a.getUTCMonth()]} ${pad2(a.getUTCDate())}`;
  const right = a.getUTCMonth() === b.getUTCMonth() ? pad2(b.getUTCDate()) : `${SHORT[b.getUTCMonth()]} ${pad2(b.getUTCDate())}`;
  return `(${ordinal(weekNumber(to))} | ${from === to ? left : `${left} - ${right}`}, ${b.getUTCFullYear()})`;
}

const releasedLine = (d: string) => `Released Date: ${ordinal(weekNumber(d))} | ${isoToUtc(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
const titleOf = (b: MonitoringBatch) => b.title || `${b.category}| WEEKLY SOLICITATION MONITORING`;
const blankItem = (sort: number): MonitoringItem => ({ entry_id: null, requestor: '', association: '', event_date: '', contact_number: '', amount: null, given_by: '', date_claimed: null, remarks: '', attachment_paths: [], sort });

const daysAgo = (n: number) => {
  const d = isoToUtc(todayIso());
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

export function MonitoringTab({ canEdit }: { canEdit: boolean }) {
  const batches = useLive(listBatches, ['monitoring_batches']);
  const [selected, setSelected] = useState<string | null>(null);
  const items = useLive(() => (selected ? listItems([selected]) : Promise.resolve([])), ['monitoring_items'], [selected]);
  const allItems = useLive(() => listItems(), ['monitoring_items']);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);

  const list = batches.data ?? [];
  const batch = list.find((b) => b.id === selected) ?? null;
  useEffect(() => {
    if (!selected && list.length) setSelected(list[0].id);
  }, [list, selected]);

  const totalOf = (id: string) => (allItems.data ?? []).filter((i) => i.batch_id === id).reduce((a, i) => a + (i.amount ?? 0), 0);
  const countOf = (id: string) => (allItems.data ?? []).filter((i) => i.batch_id === id).length;

  const create = async () => {
    try {
      const from = daysAgo(9);
      const to = daysAgo(7);
      const b = await saveBatch({ category: 'CSO', released_on: todayIso(), covering: monitoringCovering(from, to), week_no: weekNumber(to) });
      setSelected(b.id);
      setMsg({ kind: 'info', text: 'New list created. Set the category and covering dates, then add organizations.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="card h-fit">
        <div className="flex items-center justify-between border-b border-line p-3">
          <span className="text-sm font-semibold">Weekly lists</span>
          {canEdit && <Button size="sm" onClick={create}>＋ New list</Button>}
        </div>
        {!list.length && <Empty>No monitoring lists yet.</Empty>}
        <ul className="max-h-[65vh] overflow-y-auto p-1">
          {list.map((b) => (
            <li key={b.id}>
              <button onClick={() => setSelected(b.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected === b.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-brand-50/50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <Badge color="green">{b.category}</Badge>
                  <span className="text-xs tabular-nums text-muted">{peso(totalOf(b.id)) || '₱0'}</span>
                </div>
                <div className="mt-1 text-xs">{b.covering}</div>
                <div className="text-[11px] text-muted">Released {fmtLong(b.released_on)} · {countOf(b.id)} org(s)</div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="min-w-0 space-y-4">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        {batch ? (
          <BatchEditor key={batch.id} batch={batch} items={items.data ?? []} canEdit={canEdit} onDeleted={() => setSelected(null)} setMsg={setMsg} />
        ) : (
          <div className="card"><Empty>{canEdit ? 'Click “New list” to start a weekly monitoring list.' : 'No list selected.'}</Empty></div>
        )}
      </section>
    </div>
  );
}

function BatchEditor({
  batch,
  items,
  canEdit,
  onDeleted,
  setMsg,
}: {
  batch: MonitoringBatch;
  items: MonitoringItem[];
  canEdit: boolean;
  onDeleted: () => void;
  setMsg: (m: { kind: 'ok' | 'error' | 'info'; text: string } | null) => void;
}) {
  const { committees } = useSession();
  const [b, setB] = useState(batch);
  const dir = useDirectory();
  const [range, setRange] = useState<[string, string]>([daysAgo(9), daysAgo(7)]);
  const [picker, setPicker] = useState(false);
  const [scan, setScan] = useState(false);
  const [print, setPrint] = useState(false);
  const [withGiver, setWithGiver] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // Rows with typed-but-not-yet-saved changes, and the last saved title / covering.
  const [unsavedRows, setUnsavedRows] = useState<Set<string>>(new Set());
  const [savedB, setSavedB] = useState(batch);
  const markRow = useCallback((id: string, on: boolean) => {
    setUnsavedRows((s) => {
      if (s.has(id) === on) return s;
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);
  const dirty = unsavedRows.size > 0 || (b.title ?? '') !== (savedB.title ?? '') || (b.covering ?? '') !== (savedB.covering ?? '');
  /** Leaving the field being typed in saves it (every field saves itself when you leave it). */
  const saveNow = () => (document.activeElement as HTMLElement | null)?.blur();
  const givers = useMemo(() => committees.map((c) => ({ label: c.spm_name ? `SPM ${c.spm_name}` : c.name, value: c.spm_name ? `SPM ${c.spm_name}` : c.name })), [committees]);

  const persist = async (next: MonitoringBatch) => {
    setB(next);
    try {
      await saveBatch(next);
      setSavedB(next);
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const setCovering = (from: string, to: string) => {
    setRange([from, to]);
    if (from && to && from <= to) persist({ ...b, covering: monitoringCovering(from, to), week_no: weekNumber(to) });
  };

  const add = async (rows: MonitoringItem[]) => {
    try {
      for (const [i, r] of rows.entries()) await saveItem(b.id, { ...r, sort: items.length + i });
      setMsg({ kind: 'ok', text: `Added ${rows.length} row(s).` });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const total = items.reduce((a, i) => a + (i.amount ?? 0), 0);
  const header = (d: string) => ({ code: releasedLine(d), dateText: '', covering: '', office: '', title: titleOf(b), subtitle: b.covering ?? '', week: b.week_no ?? 0 });

  const base: ColumnDef<MonitoringItem>[] = [
    { label: 'Requestor', width: 18, value: (i) => i.requestor ?? '' },
    { label: 'Association / Purpose of Events', width: 28, value: (i) => i.association ?? '' },
    { label: 'Date of Event', width: 12, value: (i) => i.event_date ?? '' },
    { label: 'Contact No.', width: 12, value: (i) => i.contact_number ?? '' },
  ];
  const giverCol: ColumnDef<MonitoringItem>[] = withGiver ? [{ label: 'Given by', width: 14, value: (i) => i.given_by ?? '' }] : [];
  const claimCols: ColumnDef<MonitoringItem>[] = [...base, ...giverCol, { label: 'Date Claimed', width: 11, value: () => '' }, { label: 'Signature', width: 12, value: () => '' }];
  const amountCols: ColumnDef<MonitoringItem>[] = [...base, ...giverCol, { label: 'Amount', width: 10, value: (i) => peso(i.amount), right: true }];

  return (
    <>
      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Category">
          <select className="input" disabled={!canEdit} value={b.category} onChange={(e) => persist({ ...b, category: e.target.value, title: null })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Released date"><input type="date" className="input" disabled={!canEdit} value={b.released_on} onChange={(e) => persist({ ...b, released_on: e.target.value })} /></Field>
        <Field label="Covering from"><input type="date" className="input" disabled={!canEdit} value={range[0]} onChange={(e) => setCovering(e.target.value, range[1])} /></Field>
        <Field label="Covering to"><input type="date" className="input" disabled={!canEdit} value={range[1]} onChange={(e) => setCovering(range[0], e.target.value)} /></Field>
        <Field label="Title" className="sm:col-span-2"><input className="input" disabled={!canEdit} value={titleOf(b)} onChange={(e) => setB({ ...b, title: e.target.value })} onBlur={() => persist(b)} /></Field>
        <Field label="Covering (printed)" className="sm:col-span-2"><input className="input" disabled={!canEdit} value={b.covering ?? ''} onChange={(e) => setB({ ...b, covering: e.target.value })} onBlur={() => persist(b)} /></Field>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          {canEdit && (
            <>
              <Button size="sm" onClick={() => setPicker(true)}>＋ From published requests</Button>
              <Button size="sm" variant="secondary" onClick={() => add([blankItem(items.length)])}>＋ Add row</Button>
              <Button size="sm" variant="secondary" onClick={() => setScan(true)}>⇪ Upload &amp; scan</Button>
            </>
          )}
          <span className="ml-auto text-sm">
            {items.length} org(s) · Total <b className="tabular-nums">{peso(total) || '₱0'}</b>
          </span>
        </div>
        {!items.length ? (
          <Empty>No organizations yet. Add the approved ones that will receive money.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="stack-wide table-base text-[13px] [&_td]:px-1.5 [&_th]:px-1.5">
              <thead>
                <tr>
                  <th className="w-8">No.</th><th>Requestor</th><th>Association / Purpose</th><th>Date of event</th><th>Contact</th>
                  <th className="text-right">Amount</th><th>Given by</th><th>Files</th><th />
                </tr>
              </thead>
              <tbody>
                {items.map((it, n) => (
                  <ItemRow key={it.id} n={n + 1} item={it} batchId={b.id} canEdit={canEdit} givers={givers} orgs={dir.orgOptions} onUnsaved={markRow} />
                ))}
                <tr className="font-semibold">
                  <td colSpan={5} className="text-right">TOTAL</td>
                  <td className="text-right tabular-nums">{peso(total)}</td>
                  <td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canEdit && dirty ? (
          <Button onClick={saveNow}><Icon name="check" size={16} />Save</Button>
        ) : (
          <Button variant="secondary" disabled={!items.length} onClick={() => setPreviewing(true)}><Icon name="eye" size={16} />Preview</Button>
        )}
        <GenerateButton disabled={!items.length || dirty} onClick={() => setPrint(true)} title={dirty ? 'Save your changes first' : 'Downloads two files: claim sheet (signature) and amount report'} />
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={withGiver} onChange={(e) => setWithGiver(e.target.checked)} /> Include “Given by”</label>
        {canEdit && (
          <Button variant="ghost" className="ml-auto text-red-600" onClick={async () => { if (confirm('Delete this whole list?')) { await deleteBatch(b.id); onDeleted(); } }}>
            Delete list
          </Button>
        )}
      </div>

      {picker && <RequestPicker category={b.category} range={range} already={new Set(items.map((i) => i.entry_id).filter(Boolean) as string[])} onClose={() => setPicker(false)} onPick={(rows) => { setPicker(false); add(rows); }} />}

      <BulkScanDialog
        open={scan}
        type="ngo"
        onClose={() => setScan(false)}
        onSaved={(n) => setMsg({ kind: 'ok', text: `Added ${n} scanned row(s). Enter the amounts.` })}
        onConfirm={async (docs, files) => {
          const paths = new Map<number, string>();
          for (const d of docs) if (!paths.has(d.fileIndex)) paths.set(d.fileIndex, await uploadBudgetAttachment(files[d.fileIndex]));
          await add(
            docs.map((d, i) => ({
              ...blankItem(items.length + i),
              requestor: d.fields.name.value,
              association: [d.fields.organization.value, d.fields.barangay.value].filter(Boolean).join(' - '),
              event_date: d.fields.eventDate.value,
              contact_number: d.fields.contact.value,
              attachment_paths: [paths.get(d.fileIndex)!],
            })),
          );
        }}
      />

      <PreviewDialog
        open={previewing}
        onClose={() => setPreviewing(false)}
        title={`Preview — ${titleOf(b)}`}
        pages={[
          { label: '1. Claim sheet', columns: claimCols, footRow: undefined },
          { label: '2. Amount', columns: amountCols, footRow: ['', '', '', '', 'TOTAL', ...(withGiver ? [''] : []), peso(total)] },
        ].map((o) => ({
          label: o.label,
          render: () =>
            renderReport(
              buildReport<MonitoringItem>({
                header: header(b.released_on), columns: o.columns, entries: items, footRow: o.footRow,
                headerColor: '#b6d7a8', headerText: '#000000', encoderName: '', encoderPosition: '', note: '', paper: 'FOLIO', orientation: 'landscape',
              }),
              'pdf',
            ),
        }))}
      />

      {print && (
        <ExportDialog<MonitoringItem>
          open
          onClose={() => setPrint(false)}
          title="Generate monitoring reports"
          confirmLabel="Generate both files"
          filename={`${b.category} Monitoring ${b.released_on}`}
          intro={<Alert kind="info">Two files are downloaded: <b>1. Claim sheet</b> (blank “Date Claimed” and “Signature” columns, filled in by hand) and <b>2. Amount report</b> (with total). If your browser asks, allow multiple downloads.</Alert>}
          entries={items}
          columns={claimCols}
          outputs={[
            { suffix: 'Claim Sheet', columns: claimCols },
            { suffix: 'Amount', columns: amountCols, footRow: ['', '', '', '', 'TOTAL', ...(withGiver ? [''] : []), peso(total)] },
          ]}
          headerColor="#b6d7a8"
          headerText="#000000"
          initialDate={b.released_on}
          dateLabel="Released date"
          makeHeader={header}
          note=""
          showEncoder={false}
          defaultPaper="FOLIO"
          defaultOrientation="landscape"
        />
      )}
    </>
  );
}

function ItemRow({
  n,
  item,
  batchId,
  canEdit,
  givers,
  orgs,
  onUnsaved,
}: {
  n: number;
  item: MonitoringItem;
  batchId: string;
  canEdit: boolean;
  givers: { label: string; value: string }[];
  orgs: { label: string; value: string }[];
  onUnsaved: (id: string, unsaved: boolean) => void;
}) {
  const [v, setV] = useState(item);
  const [saved, setSaved] = useState(item); // last values known to be in the database
  const [files, setFiles] = useState(false);
  useEffect(() => {
    setV(item);
    setSaved(item);
  }, [item]);
  // Tell the list whether this row has changes that are not saved yet.
  const changed = (Object.keys(v) as (keyof MonitoringItem)[]).some((k) => k !== 'attachment_paths' && String(v[k] ?? '') !== String(saved[k] ?? ''));
  useEffect(() => {
    const id = item.id ?? '';
    onUnsaved(id, changed);
    return () => onUnsaved(id, false);
  }, [changed, item.id, onUnsaved]);
  const commit = (next: MonitoringItem) => {
    setV(next);
    saveItem(batchId, next).then(() => setSaved(next)).catch(() => {});
  };
  const text = (k: keyof MonitoringItem, w = '') => (
    <input className={`input py-1 ${w}`} disabled={!canEdit} value={(v[k] as string) ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} onBlur={() => v !== item && commit(v)} />
  );
  return (
    <tr>
      <td className="text-muted">{n}</td>
      <td>{text('requestor', 'min-w-[150px]')}</td>
      <td className="min-w-[220px]">
        <Combobox
          value={v.association ?? ''}
          onChange={(x) => setV({ ...v, association: x })}
          onCommit={(x) => x !== (item.association ?? '') && commit({ ...v, association: x })}
          options={orgs}
          placeholder="Organization / purpose"
          inputClassName="input py-1 pr-8"
          disabled={!canEdit}
          ariaLabel="Association / purpose"
        />
      </td>
      <td className="w-[170px]">
        <EventDateInput
          className="input py-1"
          aria-label="Date of event"
          disabled={!canEdit}
          value={v.event_date ?? ''}
          onChange={(x) => setV({ ...v, event_date: x })}
          onCommit={(x) => x !== (item.event_date ?? '') && commit({ ...v, event_date: x })}
        />
      </td>
      <td>{text('contact_number', 'w-[120px]')}</td>
      <td><MoneyInput className="w-[110px] py-1" disabled={!canEdit} value={v.amount} onCommit={(a) => commit({ ...v, amount: a })} /></td>
      <td className="min-w-[160px]">
        <Combobox
          value={v.given_by ?? ''}
          onChange={(g) => setV({ ...v, given_by: g })}
          onCommit={(g) => g !== (item.given_by ?? '') && commit({ ...v, given_by: g })}
          options={givers}
          placeholder="SPM / BM"
          inputClassName="input py-1 pr-8"
          disabled={!canEdit}
          ariaLabel="Given by"
        />
      </td>
      <td>
        <button className="text-xs text-brand-600 hover:underline" onClick={() => setFiles(true)}><Icon name="paperclip" size={13} />{v.attachment_paths.length}</button>
        <Modal open={files} onClose={() => { setFiles(false); commit(v); }} title="Attachments">
          <AttachmentList paths={v.attachment_paths} readOnly={!canEdit} onChange={canEdit ? (p) => setV({ ...v, attachment_paths: p }) : undefined} />
        </Modal>
      </td>
      <td>{canEdit && <button className="text-muted hover:text-red-600" aria-label="Delete row" onClick={() => item.id && confirm('Remove this row?') && deleteItem(item.id)}>✕</button>}</td>
    </tr>
  );
}

/** Choose which published requests were approved for money. */
function RequestPicker({ category, range, already, onClose, onPick }: { category: string; range: [string, string]; already: Set<string>; onClose: () => void; onPick: (rows: MonitoringItem[]) => void }) {
  const [from, setFrom] = useState(range[0]);
  const [to, setTo] = useState(range[1]);
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const { committeeName } = useSession();
  const types = CATEGORY_TYPES[category] ?? CATEGORY_TYPES.OTHER;
  const { data, loading } = useLive(async () => (await listEntries({ status: 'transmitted', from, to })).filter((e) => types.includes(e.type)), ['entries'], [from, to, category]);
  const rows = (data ?? []).filter((e) => !q || `${displayName(e)} ${orgBarangay(e)} ${e.contact_number}`.toLowerCase().includes(q.toLowerCase()));

  const toItem = (e: Entry): MonitoringItem => ({
    ...blankItem(0),
    entry_id: e.id,
    requestor: displayName(e).split('\n').pop()!.replace(/^Patient:\s*/i, ''),
    association: e.type === 'medical' ? [e.purpose, e.barangay].filter(Boolean).join(' - ') : orgBarangay(e) || e.purpose || '',
    event_date: e.event_date ?? '',
    contact_number: e.contact_number ?? '',
  });

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Add approved organizations from published requests"
      footer={
        <>
          <span className="mr-auto self-center text-sm text-muted">{chosen.size} selected</span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!chosen.size} onClick={() => onPick(rows.filter((e) => chosen.has(e.id)).map(toItem))}>Add selected</Button>
        </>
      }
    >
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Field label="Received from"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Received to"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Search"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      </div>
      <p className="mb-2 text-xs text-muted">Showing published {types.map((t) => TYPES[t].label).join(', ')} requests. Tick only the ones approved for money.</p>
      {loading ? (
        <p className="p-6 text-center text-sm text-muted">Loading…</p>
      ) : !rows.length ? (
        <Empty>No published requests in these dates.</Empty>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {rows.map((e) => {
            const done = already.has(e.id);
            return (
              <li key={e.id}>
                <label className={`flex cursor-pointer items-start gap-3 px-3 py-2 text-sm ${done ? 'opacity-50' : 'hover:bg-brand-50/50'}`}>
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={done}
                    checked={chosen.has(e.id)}
                    onChange={() => setChosen((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}
                  />
                  <span className="flex-1">
                    <span className="font-medium">{displayName(e).split('\n').pop()}</span>
                    <span className="text-muted"> · {orgBarangay(e)}</span>
                    <span className="block text-xs text-muted">{TYPES[e.type].label} · {committeeName(e.committee_id)} · {e.contact_number}{done ? ' · already in this list' : ''}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
