'use client';
// Type-ahead dropdown: shows matching suggestions (with an arrow to open the full list) but always accepts
// whatever the user types. The list floats above the page, so it is never cut off inside scrolling tables.
//  • The list opens when you type, click the arrow, or press ↓ — not just by moving into the cell,
//    so it never covers the cells below while you move around the table.
//  • Opening it on a cell that already has a value shows ALL choices (to switch to another one);
//    only what you type filters the list.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AutoTextarea } from './AutoTextarea';

export interface ComboOption<T = unknown> {
  label: string; // what is shown in the list
  value: string; // what goes into the input
  hint?: string; // small grey text
  data?: T;
}

export function Combobox<T>({
  value,
  onChange,
  onPick,
  onCommit,
  options,
  placeholder,
  required,
  maxShown = 50,
  inputClassName = 'input pr-8',
  disabled,
  invalid,
  onKeyDown,
  onPaste,
  dataCell,
  ariaLabel,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (o: ComboOption<T>) => void;
  onCommit?: (v: string) => void; // when the user leaves the field or picks an option
  options: ComboOption<T>[];
  placeholder?: string;
  required?: boolean;
  maxShown?: number;
  inputClassName?: string;
  disabled?: boolean;
  invalid?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  dataCell?: string;
  ariaLabel?: string;
  multiline?: boolean; // wraps long text onto more lines (used inside tables)
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // filter only by what was typed since the list opened
  const [navigated, setNavigated] = useState(false); // ↑/↓ used to choose a suggestion
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const Field = (multiline ? AutoTextarea : 'input') as unknown as React.ElementType;

  const matches = useMemo(() => {
    const words = typed ? value.trim().toLowerCase().split(/\s+/).filter(Boolean) : [];
    const found = words.length ? options.filter((o) => words.every((w) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(w))) : options;
    return found.slice(0, maxShown);
  }, [value, options, maxShown, typed]);

  const openList = () => {
    setTyped(false);
    // start on the current value, so Enter keeps it and arrows move from it
    const at = options.findIndex((o) => o.value === value);
    setActive(at >= 0 && at < maxShown ? at : 0);
    setOpen(true);
  };
  const closeList = () => {
    setOpen(false);
    setTyped(false);
    setNavigated(false);
  };

  // keep the highlighted choice visible
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  // Position the floating list under (or above) the input.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = input.current?.getBoundingClientRect();
      if (!r) return;
      const up = r.bottom + 260 > window.innerHeight && r.top > 260;
      setRect({ left: r.left, top: up ? r.top : r.bottom, width: Math.max(r.width, 220), up });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!input.current?.parentElement?.contains(t) && !list.current?.contains(t)) closeList();
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (o: ComboOption<T>) => {
    onChange(o.value);
    onPick?.(o);
    onCommit?.(o.value);
    closeList();
  };

  return (
    <div className="relative">
      <Field
        ref={input}
        className={`${inputClassName} ${invalid ? 'bg-red-50 ring-2 ring-inset ring-red-400 dark:bg-red-950/40' : ''}`}
        value={value}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        data-cell={dataCell}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
          if (list.current?.contains(e.relatedTarget as Node)) return;
          closeList();
          onCommit?.(e.target.value);
        }}
        onPaste={onPaste}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          onChange(e.target.value);
          setOpen(true);
          setTyped(true);
          setNavigated(false);
          setActive(0);
        }}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (!open && e.key === 'ArrowDown' && !e.altKey) {
            e.preventDefault();
            openList();
            return;
          }
          if (open && matches.length) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setNavigated(true);
              setActive((a) => Math.min(a + 1, matches.length - 1));
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setNavigated(true);
              setActive((a) => Math.max(a - 1, 0));
              return;
            }
            // Tab takes the highlighted suggestion (like a spreadsheet) and still moves to the next cell:
            // when ↑/↓ was used, when it is the only suggestion, or when it starts with what was typed.
            const hit = matches[active];
            if (e.key === 'Tab' && !e.shiftKey && hit && hit.value !== value && (navigated || (typed && value.trim() && (matches.length === 1 || hit.label.toLowerCase().startsWith(value.trim().toLowerCase()))))) {
              onChange(hit.value);
              onPick?.(hit);
              onCommit?.(hit.value);
              closeList();
              onKeyDown?.(e);
              return; // no preventDefault: the browser moves to the next cell
            }
            if (e.key === 'Enter' && matches[active] && matches[active].value !== value && (typed ? value.trim() : true)) {
              e.preventDefault();
              pick(matches[active]);
              return;
            }
          }
          if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'Enter') closeList();
          onKeyDown?.(e);
        }}
      />
      {!disabled && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show list"
          className="absolute inset-y-0 right-0 flex w-7 items-center justify-center text-muted hover:text-brand-600"
          onMouseDown={(e) => {
            e.preventDefault();
            if (open) closeList();
            else openList();
            input.current?.focus();
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
        </button>
      )}
      {open &&
        rect &&
        matches.length > 0 &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            style={{ position: 'fixed', left: rect.left, width: rect.width, ...(rect.up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.top + 4 }) }}
            className="z-[60] max-h-64 overflow-auto rounded-lg border border-line bg-panel py-1 text-sm shadow-xl"
          >
            {matches.map((o, i) => (
              <li
                key={o.label + (o.hint ?? '') + i}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-1.5 ${i === active ? 'bg-brand-50 text-brand-700' : ''}`}
              >
                {o.label}
                {o.hint && <span className="ml-2 text-xs text-muted">{o.hint}</span>}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
