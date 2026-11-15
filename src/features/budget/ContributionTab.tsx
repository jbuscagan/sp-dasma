'use client';
import { GenerateButton } from '@/components/ui/GenerateButton';
import { Icon } from '@/components/ui/Icon';
import { PreviewDialog } from '@/features/reports/PreviewDialog';
// SP Contribution report: beginning balance + additions − disbursements = remaining balance.
import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Empty, Field } from '@/components/ui';
import { useLive } from '@/hooks/useLive';
import { fmtLong, todayIso } from '@/lib/dates';
import {
  deleteContribution, listBatches, listContributionLines, listContributions, listItems, saveContribution,
  type ContributionLine, type ContributionReport,
} from './api';
import { buildLedger, renderLedger, totals } from './ledger';
import { parseMoney, peso } from './money';
import { FormatDialog } from './FormatDialog';
import { CATEGORY_LABEL } from './MonitoringTab';

export function MoneyInput({
  value,
  onChange,
  onCommit,
  disabled,
  className = '',
}: {
  value: number | null;
  onChange?: (n: number | null) => void;
  onCommit?: (n: number | null) => void; // called once when the user leaves the box
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value === null ? '' : peso(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(value === null ? '' : peso(value));
  }, [value, focus]);
  return (
    <input
      className={`input text-right tabular-nums ${className}`}
      inputMode="decimal"
      value={text}
      disabled={disabled}
      placeholder="₱0"
      onFocus={() => {
        setFocus(true);
        setText(value === null ? '' : String(value));
      }}
      onBlur={() => {
        setFocus(false);
        const n = parseMoney(text);
        if (onCommit && n !== value) onCommit(n);
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange?.(parseMoney(e.target.value));
      }}
    />
  );
}

const newLine = (kind: ContributionLine['kind'], sort: number, grp: string | null = null): ContributionLine => ({ kind, grp, label: '', amount: 0, sort });

/** Compares only what the user can change (not the save time). */
const snapshot = (r: ContributionReport, l: ContributionLine[]) =>
  JSON.stringify({ d: r.report_date, t: r.title, b: Number(r.beginning_balance), n: r.notes ?? '', l: l.map((x) => [x.kind, x.grp ?? '', x.label, Number(x.amount)]) });

export function ContributionTab({ canEdit }: { canEdit: boolean }) {
  const reports = useLive(listContributions, ['sp_contribution_reports']);
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<ContributionReport | null>(null);
  const [lines, setLines] = useState<ContributionLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // What was last saved; when the form differs from it there are unsaved edits (button shows "Save").
  const [savedSnap, setSavedSnap] = useState('');

  const list = reports.data ?? [];
  const allLines = useLive(() => listContributionLines(), ['sp_contribution_lines']);
  const remainingOf = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach((r) => m.set(r.id, totals(r, (allLines.data ?? []).filter((l) => l.report_id === r.id)).remaining));
    return m;
  }, [list, allLines.data]);

  // open the latest report by default
  useEffect(() => {
    if (selected === null && list.length) setSelected(list[0].id);
  }, [list, selected]);

  useEffect(() => {
    if (!selected || selected === 'new') return;
    const r = list.find((x) => x.id === selected);
    if (!r) return;
    setDraft({ ...r });
    listContributionLines([r.id]).then((l) => {
      setLines(l);
      setSavedSnap(snapshot(r, l));
    });
    setMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const startNew = () => {
    const last = list[0];
    setSelected('new');
    setDraft({ id: '', report_date: todayIso(), title: 'SP CONTRIBUTION REPORT', beginning_balance: last ? remainingOf.get(last.id) ?? 0 : 0, notes: '' });
    setLines([newLine('addition', 0), newLine('disbursement', 1, 'Solicitation')]);
    setMsg(last ? { kind: 'info', text: `Beginning balance taken from the remaining balance of ${fmtLong(last.report_date)}.` } : null);
  };

  const t = draft ? totals(draft, lines) : null;
  const dirty = !!draft && (!draft.id || snapshot(draft, lines) !== savedSnap);
  const upd = (i: number, patch: Partial<ContributionLine>) => setLines((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  /** Sums the monitoring amounts released after the previous report, up to this report's date. */
  const pullFromMonitoring = async () => {
    if (!draft) return;
    const prev = list.filter((r) => r.report_date < draft.report_date && r.id !== draft.id).sort((a, b) => b.report_date.localeCompare(a.report_date))[0];
    const batches = (await listBatches()).filter((b) => b.released_on <= draft.report_date && (!prev || b.released_on > prev.report_date));
    const items = await listItems(batches.map((b) => b.id));
    const sums = new Map<string, number>();
    batches.forEach((b) => {
      const total = items.filter((i) => i.batch_id === b.id).reduce((a, i) => a + (i.amount ?? 0), 0);
      const label = CATEGORY_LABEL[b.category] ?? b.category;
      if (total) sums.set(label, (sums.get(label) ?? 0) + total);
    });
    if (!sums.size) return setMsg({ kind: 'info', text: 'No monitoring amounts found for this period.' });
    setLines((l) => {
      const kept = l.filter((x) => !(x.kind === 'disbursement' && (x.grp ?? '') === 'Solicitation' && (sums.has(x.label) || !x.label)));
      const pulled = Array.from(sums.entries()).map(([label, amount], i) => ({ kind: 'disbursement' as const, grp: 'Solicitation', label, amount, sort: 100 + i }));
      return [...kept, ...pulled];
    });
    setMsg({ kind: 'ok', text: `Pulled ${sums.size} total(s) from ${batches.length} monitoring list(s)${prev ? ` released after ${fmtLong(prev.report_date)}` : ''}. Review, then Save.` });
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const id = await saveContribution({ ...draft, id: draft.id || undefined }, lines.map((l, i) => ({ ...l, sort: i })));
      const saved = { ...draft, id };
      setDraft(saved);
      setSavedSnap(snapshot(saved, lines));
      setSelected(id);
      setMsg({ kind: 'ok', text: 'Report saved.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const lineRows = (kind: ContributionLine['kind']) =>
    lines.map((l, i) => ({ l, i })).filter(({ l }) => l.kind === kind);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="card h-fit">
        <div className="flex items-center justify-between border-b border-line p-3">
          <span className="text-sm font-semibold">Reports</span>
          {canEdit && <Button size="sm" onClick={startNew}>＋ New</Button>}
        </div>
        {!list.length && <Empty>No reports yet.</Empty>}
        <ul className="max-h-[60vh] overflow-y-auto p-1">
          {list.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setSelected(r.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selected === r.id ? 'bg-brand-50 font-semibold text-brand-700' : 'hover:bg-brand-50/50'}`}
              >
                <span>{fmtLong(r.report_date)}</span>
                <span className={`tabular-nums text-xs ${(remainingOf.get(r.id) ?? 0) < 0 ? 'text-red-600' : 'text-muted'}`}>{peso(remainingOf.get(r.id) ?? 0)}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {draft ? (
        <section className="min-w-0 space-y-4">
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <div className="card grid gap-3 p-4 sm:grid-cols-3">
            <Field label="Report date"><input type="date" className="input" disabled={!canEdit} value={draft.report_date} onChange={(e) => setDraft({ ...draft, report_date: e.target.value })} /></Field>
            <Field label="Title"><input className="input" disabled={!canEdit} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
            <Field label="Beginning balance"><MoneyInput disabled={!canEdit} value={draft.beginning_balance} onChange={(n) => setDraft({ ...draft, beginning_balance: n ?? 0 })} /></Field>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Additional (income)</h3>
                {canEdit && <Button size="sm" variant="secondary" onClick={() => setLines((l) => [...l, newLine('addition', l.length)])}>＋ Line</Button>}
              </div>
              {lineRows('addition').map(({ l, i }) => (
                <div key={i} className="mb-2 grid grid-cols-[1fr_110px_28px] gap-2 sm:grid-cols-[1fr_130px_28px]">
                  <input className="input" disabled={!canEdit} placeholder="e.g. SP Contribution" value={l.label} onChange={(e) => upd(i, { label: e.target.value })} />
                  <MoneyInput disabled={!canEdit} value={l.amount} onChange={(n) => upd(i, { amount: n ?? 0 })} />
                  {canEdit && <button className="text-muted hover:text-red-600" aria-label="Remove line" onClick={() => setLines((x) => x.filter((_, j) => j !== i))}>✕</button>}
                </div>
              ))}
            </div>

            <div className="card p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Less: Disbursement</h3>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={pullFromMonitoring} title="Totals of the weekly monitoring lists">⇣ From monitoring</Button>
                    <Button size="sm" variant="secondary" onClick={() => setLines((l) => [...l, newLine('disbursement', l.length, 'Solicitation')])}>＋ Line</Button>
                  </div>
                )}
              </div>
              <div className="mb-1 hidden grid-cols-[110px_1fr_130px_28px] gap-2 text-[11px] font-semibold uppercase text-muted sm:grid">
                <span>Group</span><span>Item</span><span className="text-right">Amount</span><span />
              </div>
              {lineRows('disbursement').map(({ l, i }) => (
                <div key={i} className="mb-3 grid grid-cols-[1fr_1fr_28px] gap-2 border-b border-line pb-3 sm:mb-2 sm:grid-cols-[110px_1fr_130px_28px] sm:border-0 sm:pb-0 [&>*:nth-child(3)]:col-span-2 sm:[&>*:nth-child(3)]:col-span-1">
                  <input className="input" disabled={!canEdit} placeholder="Solicitation" value={l.grp ?? ''} onChange={(e) => upd(i, { grp: e.target.value })} />
                  <input className="input" disabled={!canEdit} placeholder="CSO / SK / Brgy / name" value={l.label} onChange={(e) => upd(i, { label: e.target.value })} />
                  <MoneyInput disabled={!canEdit} value={l.amount} onChange={(n) => upd(i, { amount: n ?? 0 })} />
                  {canEdit && <button className="text-muted hover:text-red-600" aria-label="Remove line" onClick={() => setLines((x) => x.filter((_, j) => j !== i))}>✕</button>}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Field label="Notes (one per line, printed under the report)">
              <textarea className="input min-h-[90px]" disabled={!canEdit} value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </Field>
            {t && (
              <div className="card space-y-1.5 p-4 text-sm">
                <div className="flex justify-between"><span className="text-muted">Beginning</span><span className="tabular-nums">{peso(draft.beginning_balance)}</span></div>
                <div className="flex justify-between"><span className="text-muted">+ Additional</span><span className="tabular-nums">{peso(t.additions)}</span></div>
                <div className="flex justify-between"><span className="text-muted">− Disbursement</span><span className="tabular-nums">{peso(t.disbursements)}</span></div>
                <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
                  <span>Remaining</span>
                  <span className={`tabular-nums ${t.remaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{peso(t.remaining)}</span>
                </div>
                {t.remaining < 0 && <Badge color="red">Negative balance</Badge>}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {canEdit && dirty ? (
              <Button busy={busy} onClick={save}><Icon name="check" size={16} />Save report</Button>
            ) : (
              <Button variant="secondary" disabled={!draft.id} onClick={() => setPreviewing(true)}><Icon name="eye" size={16} />Preview</Button>
            )}
            <GenerateButton variant="secondary" disabled={!draft.id} onClick={() => setExporting(true)} title={draft.id ? '' : 'Save first'} />
            {canEdit && draft.id && (
              <Button variant="ghost" className="ml-auto text-red-600" onClick={async () => { if (confirm('Delete this report?')) { await deleteContribution(draft.id); setSelected(null); setDraft(null); } }}>
                Delete
              </Button>
            )}
          </div>

          <PreviewDialog
            open={previewing}
            onClose={() => setPreviewing(false)}
            title={`Preview — SP Contribution ${fmtLong(draft.report_date)}`}
            pages={[{ label: 'SP Contribution report', render: () => renderLedger(buildLedger(draft, lines), 'pdf', 'A4', 'portrait') }]}
          />
          <FormatDialog
            open={exporting}
            onClose={() => setExporting(false)}
            title="Generate SP Contribution report"
            filename={`SP_Contribution_${draft.report_date}`}
            render={(f, p, o) => renderLedger(buildLedger(draft, lines), f, p, o)}
          />
        </section>
      ) : (
        <div className="card"><Empty>{canEdit ? 'Click “New” to create the first SP Contribution report.' : 'No report selected.'}</Empty></div>
      )}
    </div>
  );
}
