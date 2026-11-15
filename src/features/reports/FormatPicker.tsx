'use client';
// The same "PDF / Word / Excel" choice in every Generate dialog. Formats a module cannot produce are greyed out.
import { FORMATS, type ExportFormat } from './types';

export function FormatPicker({
  value,
  onChange,
  disabled = [],
  disabledHint = 'Not available here',
}: {
  value: ExportFormat;
  onChange: (f: ExportFormat) => void;
  disabled?: ExportFormat[];
  disabledHint?: string;
}) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="File format">
      {(Object.keys(FORMATS) as ExportFormat[]).map((f) => {
        const off = disabled.includes(f);
        return (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={value === f}
            disabled={off}
            title={off ? disabledHint : undefined}
            onClick={() => onChange(f)}
            className={`flex-1 rounded-lg border px-2 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              value === f ? 'border-brand-600 bg-brand-600 text-white dark:text-surface' : 'border-line hover:bg-brand-50'
            }`}
          >
            {FORMATS[f]}
          </button>
        );
      })}
    </div>
  );
}
