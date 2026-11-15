'use client';
import { Icon } from '@/components/ui/Icon';
// The DTR planner (same steps as the Apps Script dialog): pick dates and people,
// add special days, generate attendance, then create one merged PDF.
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { downloadBlob } from '@/features/reports/export';
import { todayIso } from '@/lib/dates';
import {
  DAY_NAMES, generateAttendance, parseTime, planForms, currentCutoff, cutoffRange, TYPE_LABELS,
  type DayTimes, type DayType, type DtrSettings, type Override, type RuleText,
} from './engine';
import { listAttendance, loadDtrImages, replaceAttendance, signatureDataUrl, type Employee } from './api';
import { CutoffPicker } from './CutoffPicker';
import { GenerateButton } from '@/components/ui/GenerateButton';
import { FormatPicker } from '@/features/reports/FormatPicker';
import { Modal } from '@/components/ui';
import type { PersonPlan } from './pdf';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const OVERRIDE_TYPES: DayType[] = ['HOLIDAY', 'HALF_AM', 'HALF_PM', 'CUSTOM', 'WORK'];

interface Row extends Override {
  key: number;
}
interface Result {
  kind: 'ok' | 'error';
  lines: string[];
  warnings?: string[];
}

export function Planner({
  committeeId,
  employees,
  rules,
  settings,
}: {
  committeeId: string;
  employees: Employee[];
  rules: RuleText[];
  settings: DtrSettings;
}) {
  const [[start, end], setRange] = useState<[string, string]>(() => {
    const c = currentCutoff(todayIso());
    return cutoffRange(c.month, c.cutoff);
  });
  const [genOpen, setGenOpen] = useState(false);
  const [workdays, setWorkdays] = useState<number[]>(() => rules.filter((r) => r.works).map((r) => r.day));
  const [people, setPeople] = useState<Set<string>>(() => new Set(employees.filter((e) => e.active).map((e) => e.id)));
  const [rows, setRows] = useState<Row[]>([]);
  const [withSignature, setWithSignature] = useState(true);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  // Select the active people once they have loaded; afterwards only drop people who were deleted.
  const seeded = useRef(employees.length > 0);
  useEffect(() => {
    if (!seeded.current && employees.length) {
      seeded.current = true;
      setPeople(new Set(employees.filter((e) => e.active).map((e) => e.id)));
      return;
    }
    setPeople((prev) => new Set([...prev].filter((id) => employees.some((e) => e.id === id))));
  }, [employees]);

  const names = Object.fromEntries(employees.map((e) => [e.id, e.name]));
  const selected = employees.filter((e) => people.has(e.id)).map((e) => e.id);

  const togglePerson = (id: string) =>
    setPeople((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const updateRow = (key: number, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const doGenerate = async (): Promise<Result> => {
    const res = generateAttendance({ start, end, employeeIds: selected, workdays, overrides: rows }, rules, settings, names);
    await replaceAttendance(committeeId, selected, start, end, res.rows);
    return {
      kind: 'ok',
      lines: [`Created ${res.rows.length} attendance row(s).`, ...Object.entries(res.perPerson).map(([n, c]) => `${n}: ${c} day(s)`)],
      warnings: res.warnings,
    };
  };

  const doPdf = async (prefix: string[] = []): Promise<Result> => {
    const records = await listAttendance(committeeId, start, end, selected);
    const plan: PersonPlan[] = [];
    const skipped: string[] = [];
    const warnings: string[] = [];

    for (const emp of employees.filter((e) => people.has(e.id))) {
      const days: Record<string, DayTimes> = {};
      records
        .filter((r) => r.employee_id === emp.id)
        .forEach((r) => {
          const t = { amIn: parseTime(r.am_in), amOut: parseTime(r.am_out), pmIn: parseTime(r.pm_in), pmOut: parseTime(r.pm_out) };
          if (t.amIn !== null || t.amOut !== null || t.pmIn !== null || t.pmOut !== null) days[r.work_date] = t;
        });
      if (!Object.keys(days).length) {
        skipped.push(emp.name);
        continue;
      }
      if (!emp.position || !emp.dept) warnings.push(`${emp.name}: position or department is empty, so it is not printed.`);
      const signature = withSignature && emp.signature_path ? await signatureDataUrl(emp.signature_path) : undefined;
      if (withSignature && emp.signature_path && !signature) warnings.push(`${emp.name}: e-signature could not be loaded.`);
      plan.push({ id: emp.id, name: emp.name, position: emp.position ?? '', dept: emp.dept ?? '', forms: planForms(days), signature });
    }
    if (!plan.length) throw new Error('No attendance found for the selected people and dates. Generate attendance first.');

    const { renderDtrPdf } = await import('./pdf');
    const images = await loadDtrImages(settings);
    if (!withSignature) images.official = undefined;
    if (settings.signatoryPath && !images.official) warnings.push("The official's e-signature could not be loaded.");
    const out = await renderDtrPdf(plan, settings, images);
    downloadBlob(out.blob, `DTR_${start}_to_${end}.pdf`);
    return {
      kind: 'ok',
      lines: [
        ...prefix,
        settings.layout === 'single'
          ? `Created one PDF with ${out.pages} page(s) (one form per page), in this order:`
          : `Created one PDF: ${out.forms} form(s) on ${out.pages} A4 landscape sheet(s), 3 per sheet (1-15, 16-31, 1-15 | 16-31, …). Print, then cut:`,
        ...out.order.map((o) => `${o.from === o.to ? `Page ${o.from}` : `Pages ${o.from}-${o.to}`}: ${o.name}`),
      ],
      warnings: [...(skipped.length ? [`No attendance found for: ${skipped.join(', ')}`] : []), ...warnings],
    };
  };

  const run = async (what: 'gen' | 'pdf' | 'both') => {
    setResult(null);
    if (!selected.length) return setResult({ kind: 'error', lines: ['Select at least one person.'] });
    try {
      if (what === 'gen') {
        setBusy('Generating attendance…');
        setResult(await doGenerate());
      } else if (what === 'pdf') {
        setBusy('Creating the PDF…');
        setResult(await doPdf());
      } else {
        setBusy('Generating attendance…');
        const g = await doGenerate();
        setBusy('Creating the PDF…');
        const p = await doPdf(g.lines.slice(0, 1));
        setResult({ ...p, warnings: [...(g.warnings ?? []), ...(p.warnings ?? [])] });
      }
    } catch (e) {
      setResult({ kind: 'error', lines: [e instanceof Error ? e.message : String(e)] });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h3 className="mb-3 text-sm font-semibold">1. Month &amp; cut-off</h3>
        <CutoffPicker onChange={setRange} />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-muted">Other dates…</summary>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <Field label="First date"><input type="date" className="input" value={start} onChange={(e) => setRange([e.target.value, end])} /></Field>
            <Field label="Last date"><input type="date" className="input" value={end} onChange={(e) => setRange([start, e.target.value])} /></Field>
          </div>
        </details>
        <div className="mt-3">
          <span className="label">Working days</span>
          <div className="flex flex-wrap gap-2">
            {DAY_ORDER.map((d) => (
              <label key={d} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${workdays.includes(d) ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700' : 'border-line'}`}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={workdays.includes(d)}
                  onChange={(e) => setWorkdays((w) => (e.target.checked ? [...w, d] : w.filter((x) => x !== d)))}
                />
                {DAY_NAMES[d].slice(0, 3)}
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">2. People ({people.size} selected)</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPeople(new Set(employees.map((e) => e.id)))}>All</Button>
            <Button size="sm" variant="secondary" onClick={() => setPeople(new Set())}>None</Button>
          </div>
        </div>
        {!employees.length && <Alert kind="warn">No employees yet. Add them in the Employees tab.</Alert>}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded-lg border border-line p-2.5 text-sm hover:bg-brand-50/50">
              <input type="checkbox" checked={people.has(e.id)} onChange={() => togglePerson(e.id)} aria-label={`Select ${e.name}`} />
              <span className="min-w-0 flex-1">
                <button type="button" className="font-medium hover:underline" onClick={() => togglePerson(e.id)}>{e.name}</button>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h3 className="mb-1 text-sm font-semibold">3. Special days (optional)</h3>
        <p className="mb-3 text-xs text-muted">Later rows win when two special days cover the same date.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {OVERRIDE_TYPES.map((t) => (
            <Button key={t} size="sm" variant="secondary" onClick={() => setRows((r) => [...r, { key: Date.now(), from: start, who: 'ALL', type: t }])}>
              ＋ {TYPE_LABELS[t]}
            </Button>
          ))}
        </div>
        <div className="space-y-2">
          {rows.map((r) => {
            const showAm = r.type !== 'HOLIDAY' && r.type !== 'HALF_PM';
            const showPm = r.type !== 'HOLIDAY' && r.type !== 'HALF_AM';
            return (
              <div key={r.key} className="rounded-lg border border-line p-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <Field label="Date"><input type="date" className="input" value={r.from} onChange={(e) => updateRow(r.key, { from: e.target.value })} /></Field>
                  <Field label="Until (optional)"><input type="date" className="input" value={r.to ?? ''} onChange={(e) => updateRow(r.key, { to: e.target.value })} /></Field>
                  <Field label="What happens">
                    <select className="input" value={r.type} onChange={(e) => updateRow(r.key, { type: e.target.value as DayType })}>
                      {OVERRIDE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                  </Field>
                  <Field label="Applies to">
                    <details className="input cursor-pointer">
                      <summary>{r.who === 'ALL' ? 'Everyone' : `${r.who.length} person(s)`}</summary>
                      <div className="mt-2 space-y-1">
                        {employees.map((e) => (
                          <label key={e.id} className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={r.who === 'ALL' || r.who.includes(e.id)}
                              onChange={(ev) => {
                                const current = r.who === 'ALL' ? employees.map((x) => x.id) : r.who;
                                const next = ev.target.checked ? [...current, e.id] : current.filter((x) => x !== e.id);
                                updateRow(r.key, { who: next.length === employees.length ? 'ALL' : next });
                              }}
                            />
                            {e.name}
                          </label>
                        ))}
                      </div>
                    </details>
                  </Field>
                  <div className="flex items-end">
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))}>Remove</Button>
                  </div>
                </div>
                {r.type !== 'HOLIDAY' && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {showAm && <Field label="AM In"><input type="time" className="input" value={r.amIn ?? ''} onChange={(e) => updateRow(r.key, { amIn: e.target.value })} /></Field>}
                    {showAm && <Field label="AM Out"><input type="time" className="input" value={r.amOut ?? ''} onChange={(e) => updateRow(r.key, { amOut: e.target.value })} /></Field>}
                    {showPm && <Field label="PM In"><input type="time" className="input" value={r.pmIn ?? ''} onChange={(e) => updateRow(r.key, { pmIn: e.target.value })} /></Field>}
                    {showPm && <Field label="PM Out"><input type="time" className="input" value={r.pmOut ?? ''} onChange={(e) => updateRow(r.key, { pmOut: e.target.value })} /></Field>}
                    <Field label="Note (not printed)"><input className="input" value={r.note ?? ''} placeholder="e.g. Independence Day" onChange={(e) => updateRow(r.key, { note: e.target.value })} /></Field>
                  </div>
                )}
                {r.type !== 'HOLIDAY' && r.type !== 'CUSTOM' && <p className="mt-1 text-xs text-muted">Blank times are picked at random from the rules.</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-4">
        <h3 className="mb-3 text-sm font-semibold">4. Create records &amp; generate</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" busy={busy.startsWith('Gen')} disabled={!!busy} onClick={() => run('gen')}>Create records</Button>
          <GenerateButton disabled={!!busy} onClick={() => setGenOpen(true)} />
        </div>
        <p className="mt-2 text-xs text-muted">“Create records” fills in the times (it replaces existing records of the selected people for these dates). Check them in <b>Records</b>, then <b>Generate</b>.</p>
        {busy && <div className="mt-3"><Alert>{busy}</Alert></div>}
        {result && (
          <div className="mt-3">
            <Alert kind={result.kind === 'error' ? 'error' : 'ok'}>
              {result.lines.map((l) => <div key={l}>{l}</div>)}
              {result.warnings?.map((w) => <div key={w} className="flex items-start gap-1 text-amber-700 dark:text-amber-300"><Icon name="alert" size={14} className="mt-0.5" />{w}</div>)}
            </Alert>
          </div>
        )}
      </section>

      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Generate DTR"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenOpen(false)}>Cancel</Button>
            <GenerateButton
              disabled={!!busy}
              onClick={() => {
                setGenOpen(false);
                run('pdf');
              }}
            />
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <span className="label">Format</span>
            <FormatPicker value="pdf" onChange={() => undefined} disabled={['docx', 'xlsx']} disabledHint="DTR forms are printed as PDF only" />
            <p className="mt-1 text-xs text-muted">DTR forms print as PDF on A4 landscape (3 forms per sheet). Word and Excel are not available for DTR.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withSignature} onChange={(e) => setWithSignature(e.target.checked)} />
            Print e-signatures (SPM and employees who have one)
          </label>
        </div>
      </Modal>
    </div>
  );
}
