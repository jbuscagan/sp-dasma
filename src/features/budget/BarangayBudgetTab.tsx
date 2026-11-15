'use client';
import { GenerateButton } from '@/components/ui/GenerateButton';
// Annual budget per barangay (Barangay + SK). All barangays of the directory are listed for the chosen year.
import { useMemo, useState } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { useDirectory } from '@/features/directory/useDirectory';
import { ExportDialog } from '@/features/reports/ExportDialog';
import { useLive } from '@/hooks/useLive';
import { fmtHeaderDate, todayIso } from '@/lib/dates';
import type { ColumnDef } from '@/features/transmittal/config';
import { listBarangayBudgets, upsertBarangayBudget, type BarangayBudget } from './api';
import { MoneyInput } from './ContributionTab';
import { parseMoney, peso } from './money';

interface Row extends BarangayBudget {
  total: number;
}

export function BarangayBudgetTab({ canEdit }: { canEdit: boolean }) {
  const thisYear = Number(todayIso().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [q, setQ] = useState('');
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState('');
  const dir = useDirectory();
  const saved = useLive(() => listBarangayBudgets(year), ['barangay_budgets'], [year]);

  const rows: Row[] = useMemo(() => {
    const byName = new Map((saved.data ?? []).map((b) => [b.barangay.toLowerCase(), b]));
    const names = Array.from(new Set([...dir.barangays, ...(saved.data ?? []).map((b) => b.barangay)]));
    return names
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .map((name) => {
        const b = byName.get(name.toLowerCase()) ?? { year, barangay: name, brgy_budget: null, sk_budget: null, remarks: null };
        return { ...b, total: (b.brgy_budget ?? 0) + (b.sk_budget ?? 0) };
      });
  }, [dir.barangays, saved.data, year]);

  const shown = rows.filter((r) => !q || r.barangay.toLowerCase().includes(q.toLowerCase()));
  const sum = (k: 'brgy_budget' | 'sk_budget' | 'total') => rows.reduce((a, r) => a + (r[k] ?? 0), 0);

  const save = (r: BarangayBudget) => upsertBarangayBudget({ ...r, year }).catch((e) => setMsg(e.message));

  /** Paste from Excel: "Barangay ⇥ Barangay budget ⇥ SK budget" (barangay names are matched). */
  const onPaste = async (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/\t/.test(text)) return;
    e.preventDefault();
    let n = 0;
    for (const line of text.replace(/\r/g, '').split('\n')) {
      const [name, brgy, sk] = line.split('\t');
      const row = rows.find((r) => r.barangay.toLowerCase() === (name ?? '').trim().toLowerCase());
      if (!row) continue;
      await upsertBarangayBudget({ ...row, year, brgy_budget: parseMoney(brgy), sk_budget: parseMoney(sk) });
      n++;
    }
    setMsg(`Pasted ${n} barangay(s).`);
  };

  const columns: ColumnDef<Row>[] = [
    { label: 'BARANGAY', width: 26, value: (r) => r.barangay },
    { label: 'BARANGAY BUDGET', width: 18, value: (r) => peso(r.brgy_budget), right: true },
    { label: 'SK BUDGET', width: 18, value: (r) => peso(r.sk_budget), right: true },
    { label: 'TOTAL', width: 18, value: (r) => peso(r.total, { blankZero: true }), right: true },
  ]; // Remarks stay on screen only; they are not printed.

  return (
    <div className="space-y-4">
      {msg && <Alert kind="ok">{msg}</Alert>}
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <Field label="Year">
          <select className="input w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 6 }, (_, i) => thisYear + 1 - i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
        <Field label="Search barangay"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <div className="ml-auto grid grid-cols-3 gap-4 text-right text-sm">
          <div><div className="text-xs text-muted">Barangay</div><b className="tabular-nums">{peso(sum('brgy_budget')) || '₱0'}</b></div>
          <div><div className="text-xs text-muted">SK</div><b className="tabular-nums">{peso(sum('sk_budget')) || '₱0'}</b></div>
          <div><div className="text-xs text-muted">Total</div><b className="tabular-nums">{peso(sum('total')) || '₱0'}</b></div>
        </div>
        <GenerateButton onClick={() => setExporting(true)} />
      </div>
      {canEdit && <p className="text-xs text-muted">Tip: copy three columns from Excel (Barangay, Barangay budget, SK budget) and paste anywhere in the table.</p>}

      <div className="card max-h-[65vh] overflow-auto" onPaste={canEdit ? onPaste : undefined}>
        <table className="table-base">
          <thead>
            <tr><th>#</th><th>Barangay</th><th className="text-right">Barangay budget</th><th className="text-right">SK budget</th><th className="text-right">Total</th><th>Remarks</th></tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.barangay}>
                <td className="text-muted">{i + 1}</td>
                <td className="font-medium">{r.barangay}</td>
                <td><MoneyInput className="w-40 py-1" disabled={!canEdit} value={r.brgy_budget} onCommit={(n) => save({ ...r, brgy_budget: n })} /></td>
                <td><MoneyInput className="w-40 py-1" disabled={!canEdit} value={r.sk_budget} onCommit={(n) => save({ ...r, sk_budget: n })} /></td>
                <td className="text-right font-semibold tabular-nums">{peso(r.total, { blankZero: true })}</td>
                <td><input className="input py-1" disabled={!canEdit} defaultValue={r.remarks ?? ''} onBlur={(e) => e.target.value !== (r.remarks ?? '') && save({ ...r, remarks: e.target.value || null })} /></td>
              </tr>
            ))}
            <tr className="font-bold">
              <td colSpan={2} className="text-right">TOTAL</td>
              <td className="text-right tabular-nums">{peso(sum('brgy_budget'))}</td>
              <td className="text-right tabular-nums">{peso(sum('sk_budget'))}</td>
              <td className="text-right tabular-nums">{peso(sum('total'))}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <ExportDialog<Row>
        open={exporting}
        onClose={() => setExporting(false)}
        title={`Generate ${year} barangay & SK budget report`}
        entries={rows}
        columns={columns}
        headerColor="#cfe2f3"
        headerText="#000000"
        initialDate={todayIso()}
        dateLabel="Date prepared"
        note=""
        defaultOrientation="portrait"
        makeHeader={(d) => ({ code: '', dateText: fmtHeaderDate(d), covering: '', office: 'SANGGUNIANG PANLUNGSOD NG DASMARIÑAS', title: `ANNUAL BUDGET OF BARANGAYS AND SK – ${year}`, week: 0 })}
        footRow={['', 'TOTAL', peso(sum('brgy_budget')), peso(sum('sk_budget')), peso(sum('total'))]}
      />
    </div>
  );
}
