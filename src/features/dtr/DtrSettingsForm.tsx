'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { downloadBlob } from '@/features/reports/export';
import { compileRules, DAY_NAMES, parseRange, type DtrSettings, type RuleText } from './engine';
import { loadDtrImages, saveConfig, signatureDataUrl, uploadOfficialSignature } from './api';

type NumKey = { [K in keyof DtrSettings]: DtrSettings[K] extends number ? K : never }[keyof DtrSettings];

const SHEET: [NumKey, string, string][] = [
  ['sheetMarginX', 'Left margin (mm)', 'From the paper edge to the first form.'],
  ['sheetMarginY', 'Top margin (mm)', ''],
  ['sheetGap', 'Gap between forms (mm)', 'Cutting space.'],
];

const TUNING: [NumKey, string, string][] = [
  ['xShift', 'X shift (mm)', 'After a test print: move all text right (+) or left (−).'],
  ['yShift', 'Y shift (mm)', 'Move all text down (+) or up (−).'],
  ['timeYShift', 'Time vertical shift (mm)', 'Times only. 0 = centred in the row.'],
  ['timeFont', 'Time font size', ''],
  ['headFont', 'Header font size', 'Name / position / department.'],
  ['formW', 'Form width (mm)', 'One form. Default 94.2.'],
  ['formH', 'Form height (mm)', 'Default 191.'],
  ['offsetL', 'Single layout: offset left (mm)', 'Pre-printed forms only.'],
  ['offsetT', 'Single layout: offset top (mm)', ''],
  ['footerNameFont', 'Printed names font size', 'SPM and employee names; long names shrink.'],
  ['footerLabelFont', 'Label font size', '“Employee’s signature” and the SPM title.'],
  ['footerSigMaxH', 'E-signature max height (mm)', 'Never covers “I hereby certify…”.'],
  ['footerYShift', 'Signature area shift (mm)', '+ down / − up'],
];

function NumberFields({ list, s, set }: { list: [NumKey, string, string][]; s: DtrSettings; set: (k: NumKey, v: number) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {list.map(([k, label, hint]) => (
        <Field key={k} label={label} hint={hint}>
          <input type="number" step="0.01" className="input" value={s[k]} onChange={(e) => set(k, Number(e.target.value))} />
        </Field>
      ))}
    </div>
  );
}

export function DtrSettingsForm({ committeeId, rules, settings }: { committeeId: string; rules: RuleText[]; settings: DtrSettings }) {
  const [r, setR] = useState(rules);
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setR(rules), [rules]);
  useEffect(() => setS(settings), [settings]);

  const ordered = [1, 2, 3, 4, 5, 6, 0].map((d) => r.find((x) => x.day === d)!).filter(Boolean);
  const setRule = (day: number, patch: Partial<RuleText>) => setR((list) => list.map((x) => (x.day === day ? { ...x, ...patch } : x)));

  const save = async () => {
    setMsg(null);
    try {
      compileRules(r); // validates every range
      if (!parseRange(s.halfAmOut, true) || !parseRange(s.halfPmIn, true)) throw new Error('Half-day ranges must look like 11:30-12:05.');
      setBusy(true);
      await saveConfig(committeeId, r, s);
      setMsg({ kind: 'ok', text: 'DTR settings saved for your office.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const [sigPreview, setSigPreview] = useState<string>();
  useEffect(() => {
    if (s.signatoryPath) signatureDataUrl(s.signatoryPath).then(setSigPreview);
    else setSigPreview(undefined);
  }, [s.signatoryPath]);

  const uploadOfficial = async (file: File) => {
    try {
      const path = await uploadOfficialSignature(file, committeeId);
      const next = { ...s, signatoryPath: path };
      setS(next);
      await saveConfig(committeeId, r, next);
      setSigPreview(await signatureDataUrl(path));
      setMsg({ kind: 'ok', text: "Official's e-signature uploaded and saved." });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  /** Sample sheet with a red grid where times land: print on plain paper to check alignment. */
  const calibration = async () => {
    const { renderDtrPdf } = await import('./pdf');
    const t = { amIn: 450, amOut: 720, pmIn: 765, pmOut: 1110 };
    const days = (from: number, to: number) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, t]));
    const person = { id: 'x', name: 'Juan Dela Cruz', position: 'Clerk', dept: 'SP' };
    const out = await renderDtrPdf(
      [
        { ...person, forms: [{ type: 'A', key: 'A', days: days(1, 15) }, { type: 'B', key: 'B', days: days(16, 31) }] },
        { ...person, id: 'y', forms: [{ type: 'A', key: 'A2', days: days(1, 15) }] },
      ],
      s,
      await loadDtrImages(s),
      { guides: true },
    );
    downloadBlob(out.blob, 'DTR_calibration.pdf');
  };

  const setNum = (k: NumKey, v: number) => setS((x) => ({ ...x, [k]: v }));

  return (
    <div className="space-y-4">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <section className="card overflow-x-auto p-4">
        <h3 className="mb-1 text-sm font-semibold">Time rules per day</h3>
        <p className="mb-3 text-xs text-muted">Times are picked at random inside each range. Lunch is in minutes (PM In = AM Out + lunch).</p>
        <table className="table-base">
          <thead>
            <tr><th>Day</th><th>Works</th><th>AM In</th><th>AM Out</th><th>Lunch (min)</th><th>PM Out</th></tr>
          </thead>
          <tbody>
            {ordered.map((x) => (
              <tr key={x.day}>
                <td className="font-medium">{DAY_NAMES[x.day]}</td>
                <td><input type="checkbox" checked={x.works} onChange={(e) => setRule(x.day, { works: e.target.checked })} /></td>
                {(['amIn', 'amOut', 'lunch', 'pmOut'] as const).map((k) => (
                  <td key={k}><input className="input w-32 py-1" value={x[k]} onChange={(e) => setRule(x.day, { [k]: e.target.value })} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Half day (morning) – random AM Out"><input className="input" value={s.halfAmOut} onChange={(e) => setS({ ...s, halfAmOut: e.target.value })} /></Field>
          <Field label="Half day (afternoon) – random PM In"><input className="input" value={s.halfPmIn} onChange={(e) => setS({ ...s, halfPmIn: e.target.value })} /></Field>
        </div>
      </section>

      <section className="card p-4">
        <h3 className="mb-1 text-sm font-semibold">Certifying official (bottom-left of every form)</h3>
        <p className="mb-3 text-xs text-muted">Printed under “I hereby certify…”, with the e-signature over the name, like your sample.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name"><input className="input" value={s.signatoryName} placeholder="ROBIN CHESTER J. CANTIMBUHAN" onChange={(e) => setS({ ...s, signatoryName: e.target.value })} /></Field>
          <Field label="Title"><input className="input" value={s.signatoryTitle} onChange={(e) => setS({ ...s, signatoryTitle: e.target.value })} /></Field>
          <Field label="E-signature" hint="PNG with transparent background works best.">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {sigPreview && <img src={sigPreview} alt="Official e-signature" className="h-10 max-w-[90px] rounded border border-line bg-white object-contain p-0.5" />}
              <label className="cursor-pointer rounded-lg border border-line px-3 py-2 text-sm hover:bg-brand-50">
                {s.signatoryPath ? 'Replace' : 'Upload'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && uploadOfficial(e.target.files[0])} />
              </label>
              {s.signatoryPath && <button className="text-xs text-red-600 hover:underline" onClick={() => setS({ ...s, signatoryPath: '' })}>Remove</button>}
            </div>
          </Field>
          <Field label="Show on forms">
            <label className="flex h-[38px] items-center gap-2 text-sm">
              <input type="checkbox" checked={s.signatoryShow} onChange={(e) => setS({ ...s, signatoryShow: e.target.checked })} /> Print name, title and e-signature
            </label>
          </Field>
        </div>
      </section>

      <section className="card p-4">
        <h3 className="mb-1 text-sm font-semibold">Employee signature line</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.employeeNameShow} onChange={(e) => setS({ ...s, employeeNameShow: e.target.checked })} />
          Print the employee’s name on the “Employee’s signature” line, with their e-signature over it (upload it in Employees or Planner)
        </label>
      </section>

      <section className="card p-4">
        <h3 className="mb-1 text-sm font-semibold">Page layout</h3>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className={`cursor-pointer rounded-xl border p-3 text-sm ${s.layout !== 'single' ? 'border-brand-600 bg-brand-50' : 'border-line'}`}>
            <input type="radio" className="mr-2" checked={s.layout !== 'single'} onChange={() => setS({ ...s, layout: 'sheet3' })} />
            <b>3 forms per A4 landscape (recommended)</b>
            <span className="mt-1 block text-xs text-muted">Plain paper. Prints the whole form. Order 1-15, 16-31, 1-15 | 16-31, 1-15, 16-31 … then cut.</span>
          </label>
          <label className={`cursor-pointer rounded-xl border p-3 text-sm ${s.layout === 'single' ? 'border-brand-600 bg-brand-50' : 'border-line'}`}>
            <input type="radio" className="mr-2" checked={s.layout === 'single'} onChange={() => setS({ ...s, layout: 'single' })} />
            <b>1 form per page</b>
            <span className="mt-1 block text-xs text-muted">Text only, for feeding already-printed forms into the printer.</span>
          </label>
        </div>
        {s.layout !== 'single' && (
          <>
            <label className="mb-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.printBackground} onChange={(e) => setS({ ...s, printBackground: e.target.checked })} />
              Print the form itself (turn off only if the sheet already has the forms printed)
            </label>
            <NumberFields list={SHEET} s={s} set={setNum} />
          </>
        )}
      </section>

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold">Advanced calibration</summary>
        <p className="my-3 text-xs text-muted">Download the calibration page, print it at 100 % (no “fit to page”), and adjust if the text is off.</p>
        <NumberFields list={TUNING} s={s} set={setNum} />
      </details>

      <div className="flex flex-wrap gap-2">
        <Button busy={busy} onClick={save}>Save settings</Button>
        <Button variant="secondary" onClick={calibration}>Download calibration / test page</Button>
      </div>
    </div>
  );
}
