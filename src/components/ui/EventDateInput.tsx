'use client';
// "Date of event": click to pick a From–To range on the calendar (To is optional),
// or type freely. The result is written as "December 20–21, 2026".
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDateRange, parseDateRange } from '@/lib/format';

export function EventDateInput({
  value,
  onChange,
  onCommit,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { value: string; onChange: (v: string) => void; onCommit?: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState({ from: '', to: '' });
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const r = box.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.min(r.left, window.innerWidth - 300), top: r.bottom + 260 > window.innerHeight ? r.top - 214 : r.bottom + 4 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const apply = () => {
    const v = formatDateRange(range.from, range.to);
    onChange(v);
    onCommit?.(v);
    setOpen(false);
  };

  return (
    <div className="relative" ref={box}>
      <input {...rest} className={`${className} pr-7`} value={value} onChange={(e) => onChange(e.target.value)} onBlur={(e) => onCommit?.(e.target.value)} />
      {!rest.disabled && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Pick dates"
          className="absolute inset-y-0 right-0 flex w-7 items-center justify-center text-muted hover:text-brand-600"
          onClick={() => {
            setRange(parseDateRange(value));
            setOpen((o) => !o);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        </button>
      )}
      {open &&
        pos &&
        createPortal(
          <div ref={pop} style={{ position: 'fixed', left: pos.left, top: pos.top }} className="z-[60] w-[290px] space-y-2 rounded-xl border border-line bg-panel p-3 shadow-xl">
            <label className="block text-xs font-semibold uppercase text-muted">
              From
              <input type="date" className="input mt-1" value={range.from} onChange={(e) => setRange((r) => ({ from: e.target.value, to: r.to && r.to < e.target.value ? '' : r.to }))} />
            </label>
            <label className="block text-xs font-semibold uppercase text-muted">
              To <span className="font-normal normal-case">(optional)</span>
              <input type="date" className="input mt-1" min={range.from || undefined} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </label>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted">{formatDateRange(range.from, range.to)}</span>
              <button type="button" disabled={!range.from} onClick={apply} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:text-surface">
                Use
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
