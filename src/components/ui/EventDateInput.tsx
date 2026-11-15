'use client';
import { useRef } from 'react';

/** "November 20, 2026" — how a date picked from the calendar is written. */
export const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** "Date of event": type freely (e.g. "Nov 20-21") or pick a day from the calendar. */
export function EventDateInput({
  value,
  onChange,
  onCommit,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { value: string; onChange: (v: string) => void; onCommit?: (v: string) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div className="relative">
      <input {...rest} className={`${className} pr-7`} value={value} placeholder="e.g. November 20, 2026" onChange={(e) => onChange(e.target.value)} onBlur={(e) => onCommit?.(e.target.value)} />
      {!rest.disabled && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Pick a date"
          className="absolute inset-y-0 right-0 flex w-7 items-center justify-center text-muted hover:text-brand-600"
          onClick={() => {
            const p = picker.current;
            if (!p) return;
            try {
              p.showPicker();
            } catch {
              p.click();
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        </button>
      )}
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        onChange={(e) => {
          if (!e.target.value) return;
          const v = longDate(e.target.value);
          onChange(v);
          onCommit?.(v);
        }}
      />
    </div>
  );
}

