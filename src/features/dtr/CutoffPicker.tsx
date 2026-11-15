'use client';
// Month + cut-off chooser used by Records and the Planner.
import { useEffect, useState } from 'react';
import { Field } from '@/components/ui';
import { todayIso } from '@/lib/dates';
import { CUTOFF_LABELS, currentCutoff, cutoffRange, type Cutoff } from './engine';

export function CutoffPicker({ onChange }: { onChange: (range: [string, string]) => void }) {
  const init = currentCutoff(todayIso());
  const [month, setMonth] = useState(init.month);
  const [cutoff, setCutoff] = useState<Cutoff>(init.cutoff);

  useEffect(() => {
    if (/^\d{4}-\d{2}$/.test(month)) onChange(cutoffRange(month, cutoff));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, cutoff]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Month">
        <input type="month" className="input w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
      </Field>
      <div className="flex gap-1 rounded-lg border border-line p-0.5" role="radiogroup" aria-label="Cut-off">
        {(Object.keys(CUTOFF_LABELS) as Cutoff[]).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={cutoff === c}
            onClick={() => setCutoff(c)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${cutoff === c ? 'bg-brand-600 text-white dark:text-surface' : 'text-muted hover:bg-brand-50'}`}
          >
            {CUTOFF_LABELS[c]}
          </button>
        ))}
      </div>
    </div>
  );
}
