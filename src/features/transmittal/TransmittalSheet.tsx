'use client';
// The Transmittal table works like a spreadsheet and always fits the screen width (long text wraps):
//  • every row is edited in place (saved when you leave a cell),
//  • the last row is always empty — fill it and press Enter: it is saved and a new empty row opens,
//  • Organization, Barangay, Request (and Purpose) are dropdowns you can also type into,
//  • Date of event has a From–To calendar,
//  • ticking the checkbox = received by your office (shown in "Received by") and selects the row for Generate / Transmit,
//  • type a number in # to move a row (e.g. 1 = top),
//  • values are cleaned up when saved (phone 09XXXXXXXXX, official barangay spelling, …).
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { AutoTextarea } from '@/components/ui/AutoTextarea';
import { Combobox, type ComboOption } from '@/components/ui/Combobox';
import { EventDateInput } from '@/components/ui/EventDateInput';
import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/features/auth/session';
import { useDirectory } from '@/features/directory/useDirectory';
import type { Reorder } from '@/hooks/useReorder';
import { fmtLong, parseDateText, todayIso } from '@/lib/dates';
import { canonical, formatName, formatPhone, officeShortName } from '@/lib/format';
import { splitOrgBarangay } from '@/features/scan/tableParse';
import type { Entry, EntryInput, Transmittal, TransmittalType } from '@/lib/types';
import { patchEntry, saveEntry } from './api';
import { needsDetails, TYPES, type FieldDef } from './config';

type Row = Record<string, string>;

const cellCls =
  'w-full min-w-0 bg-transparent px-1.5 py-1.5 text-[13px] leading-snug outline-none focus:bg-brand-50 focus:ring-2 focus:ring-inset focus:ring-brand-500 disabled:cursor-not-allowed';

/** Relative column widths so the table fits the screen. */
const widthOf = (f: FieldDef) =>
  f.kind === 'date' ? 9 : f.kind === 'phone' ? 9 : f.key === 'event_date' ? 10 : f.kind === 'textarea' ? 14 : f.kind === 'assistance' ? 9 : 11;

export function TransmittalSheet({
  type,
  rows,
  reorder,
  isChecked,
  onCheck,
  transmittals,
  onDetails,
  onDelete,
  onNotice,
}: {
  type: TransmittalType;
  rows: Entry[];
  reorder: Reorder;
  isChecked: (e: Entry) => boolean;
  onCheck: (ids: string[], on: boolean) => void;
  transmittals: Map<string, Transmittal>;
  onDetails: (e: Entry) => void;
  onDelete: (e: Entry) => void;
  onNotice: (kind: 'ok' | 'error', text: string) => void;
}) {
  const cfg = TYPES[type];
  const fields = cfg.fields;
  const { committee, committeeName } = useSession();
  const dir = useDirectory();
  const table = useRef<HTMLTableElement>(null);

  const blank = (): Row => ({ date_received: todayIso(), ...Object.fromEntries(Object.entries(cfg.defaults ?? {}).map(([k, v]) => [k, String(v ?? '')])) });
  const [pending, setPending] = useState<Row[]>(() => [blank()]);
  const [missing, setMissing] = useState<Record<number, string[]>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setPending([blank()]), [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const optionsFor = (f: FieldDef): ComboOption[] =>
    f.kind === 'organization' ? dir.orgOptions : f.kind === 'barangay' ? dir.barangayOptions : (f.options ?? []).map((o) => ({ label: o, value: o }));

  /** Same format everywhere: phone 09XXXXXXXXX, official barangay / option spelling, tidy names. */
  const clean = (f: FieldDef, v: string): string => {
    const t = v.trim();
    if (!t) return '';
    if (f.kind === 'phone') return formatPhone(t);
    if (f.kind === 'barangay') return canonical(t, dir.barangays);
    if (f.kind === 'choice') return canonical(t, f.options ?? []);
    if (f.kind === 'date') return parseDateText(t) ?? t;
    if (f.key === 'solicitor_name' || f.key === 'patient_name') return formatName(t);
    return t.replace(/\s+/g, ' ');
  };

  // Published rows are locked unless an admin opened a revision or gave this office the permission.
  const editable = (e: Entry) =>
    e.status !== 'transmitted' || !!committee?.can_edit_published || !!(e.transmittal_id && transmittals.get(e.transmittal_id)?.revision_open);
  const isEmpty = (r: Row) => fields.every((f) => f.key === 'date_received' || f.kind === 'assistance' || !(r[f.key] ?? '').trim());
  const missingOf = (r: Row) => fields.filter((f) => f.required && !(r[f.key] ?? '').trim()).map((f) => String(f.key));

  const focusKey = (key: string) => setTimeout(() => table.current?.querySelector<HTMLElement>(`[data-cell="${key}"]`)?.focus(), 30);
  // Existing rows are "r-<row>-<col>", empty rows are "new-<row>-<col>".
  const focus = (row: number, col: number) => focusKey(row < rows.length ? `r-${row}-${col}` : `new-${row - rows.length}-${col}`);

  // ---------- saving the empty row(s) ----------
  const toInput = (r: Row): EntryInput => {
    const input: Record<string, unknown> = { type, committee_id: committee?.id, status: 'draft' };
    fields.forEach((f) => (input[f.key] = clean(f, r[f.key] ?? '') || null));
    input.date_received = parseDateText(r.date_received ?? '') ?? todayIso();
    input.request_details = (r.request_details ?? '').trim() || null;
    input.assistance_status = r.assistance_status === 'received' ? 'received' : 'pending';
    return input as EntryInput;
  };

  const savePending = async (indexes: number[]) => {
    if (!committee) return false;
    const bad: Record<number, string[]> = {};
    indexes.forEach((i) => {
      const m = missingOf(pending[i]);
      if (m.length) bad[i] = m;
    });
    if (Object.keys(bad).length) {
      setMissing(bad);
      const [i] = Object.keys(bad).map(Number);
      focus(rows.length + i, fields.findIndex((f) => f.key === bad[i][0]));
      onNotice('error', `Fill in: ${bad[i].map((k) => fields.find((f) => f.key === k)?.label.split(' (')[0]).join(', ')}`);
      return false;
    }
    setSaving(true);
    try {
      for (const i of indexes) await saveEntry(toInput(pending[i]));
      const left = pending.filter((_, i) => !indexes.includes(i) && !isEmpty(pending[i]));
      const last = pending[pending.length - 1];
      const next = [...left, { ...blank(), date_received: last?.date_received || todayIso() }];
      setPending(next);
      setMissing({});
      focusKey(`new-${next.length - 1}-1`); // ready for the next request
      return true;
    } catch (err) {
      onNotice('error', err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const setPendingCell = (pi: number, key: string, value: string) => setPending((list) => list.map((r, i) => (i === pi ? { ...r, [key]: value } : r)));

  // Paste several cells from Excel into the empty row(s); values are cleaned up the same way.
  const onPaste = (e: React.ClipboardEvent, pi: number, ci: number) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    setPending((list) => {
      const next = [...list];
      lines.forEach((cells, li) => {
        while (next.length <= pi + li) next.push(blank());
        const row = { ...next[pi + li] };
        cells.forEach((v, vi) => {
          const f = fields[ci + vi];
          if (!f || f.kind === 'assistance') return;
          row[f.key] = f.kind === 'date' ? parseDateText(v) ?? todayIso() : clean(f, v);
        });
        next[pi + li] = row;
      });
      return [...next.filter((r) => !isEmpty(r)), blank()];
    });
    onNotice('ok', `Pasted ${lines.length} row(s). Check them, then press “Save pasted rows”.`);
  };

  // ---------- editing an existing row ----------
  /**
   * Organization = organization only, barangay = barangay only:
   * "KBDM - Salitran IV" typed in either box becomes KBDM + Salitran IV (the barangay is filled only if empty).
   */
  const placeSplit = (key: string, value: string, currentBarangay: string): Record<string, string | null> => {
    if (key === 'organization' && value) {
      const s = splitOrgBarangay(value, dir.barangays);
      if (!s.barangay) return {};
      return { organization: s.organization || null, ...(currentBarangay.trim() ? {} : { barangay: s.barangay }) };
    }
    if (key === 'barangay' && value && !dir.barangays.includes(value)) {
      const s = splitOrgBarangay(value, dir.barangays);
      if (s.barangay && s.organization) return { barangay: s.barangay, organization: s.organization };
    }
    return {};
  };

  const commitCell = async (e: Entry, f: FieldDef | null, key: string, raw: string) => {
    const value = f ? clean(f, raw) : raw.trim();
    const old = String((e as unknown as Record<string, unknown>)[key] ?? '');
    if (old === value) return;
    const patch: Record<string, unknown> = { [key]: value || null, ...placeSplit(key, value, e.barangay ?? '') };
    if (key === 'assistance_status' && value !== 'received') patch.assistance_date = null;
    try {
      await patchEntry(e.id, patch as EntryInput);
    } catch (err) {
      onNotice('error', err instanceof Error ? err.message : String(err));
    }
  };

  const allOn = rows.length > 0 && rows.every(isChecked);
  const pendingCount = pending.filter((r) => !isEmpty(r)).length;
  // "Received by" sits just before Remarks (or at the end when a type has no Remarks column).
  const remarksAt = fields.findIndex((f) => f.key === 'remarks');
  const receivedAt = remarksAt >= 0 ? remarksAt : fields.length;
  const totalW = 3 + 4 + fields.reduce((a, f) => a + widthOf(f), 0) + 10 + 6;
  const pct = (w: number) => `${(w / totalW) * 100}%`;

  /** One editable cell, the same for existing rows and the empty row. */
  const cell = (
    f: FieldDef,
    value: string,
    o: {
      disabled?: boolean;
      onChange: (v: string) => void;
      onCommit?: (v: string) => void;
      dataCell: string;
      onKeyDown: (ev: React.KeyboardEvent) => void;
      onPaste?: (ev: React.ClipboardEvent) => void;
      invalid?: boolean;
    },
  ) => {
    const invalidCls = o.invalid ? 'bg-red-50 ring-2 ring-inset ring-red-400 dark:bg-red-950/40' : '';
    const label = f.label.split(' (')[0];
    const common = { 'data-cell': o.dataCell, 'aria-label': label, disabled: o.disabled, onKeyDown: o.onKeyDown, onPaste: o.onPaste };

    if (f.kind === 'assistance') {
      return (
        <select {...common} className={`${cellCls} ${invalidCls}`} value={value || 'pending'} onChange={(ev) => { o.onChange(ev.target.value); o.onCommit?.(ev.target.value); }}>
          <option value="pending">Pending</option>
          <option value="received">Received</option>
        </select>
      );
    }
    if (f.kind === 'date') {
      return <input {...common} className={`${cellCls} ${invalidCls}`} type="date" value={value} onChange={(ev) => o.onChange(ev.target.value)} onBlur={(ev) => o.onCommit?.(ev.target.value)} />;
    }
    if (f.kind === 'organization' || f.kind === 'barangay' || f.kind === 'choice') {
      return (
        <Combobox
          multiline
          value={value}
          onChange={o.onChange}
          onCommit={o.onCommit}
          options={optionsFor(f)}
          inputClassName={`${cellCls} pr-6`}
          invalid={o.invalid}
          disabled={o.disabled}
          dataCell={o.dataCell}
          ariaLabel={label}
          onKeyDown={o.onKeyDown}
          onPaste={o.onPaste}
        />
      );
    }
    if (f.key === 'event_date') {
      return <EventDateInput {...common} className={`${cellCls} ${invalidCls}`} value={value} onChange={o.onChange} onCommit={o.onCommit} />;
    }
    return (
      <AutoTextarea
        {...common}
        className={`${cellCls} ${invalidCls}`}
        value={value}
        inputMode={f.kind === 'phone' ? 'tel' : undefined}
        onChange={(ev) => o.onChange(ev.target.value)}
        onBlur={(ev) => o.onCommit?.(ev.target.value)}
      />
    );
  };

  const receivedCell = (e: Entry, checked: boolean) => (
    <td key="received-by" className="border-l border-line px-1.5 py-1.5 align-top text-xs">
      {checked ? (
        <span title={e.received_at ? `Received ${fmtLong(e.received_at)}` : undefined} className="font-semibold text-brand-700">
          {e.received_by || officeShortName(committee)}
        </span>
      ) : null}
    </td>
  );

  return (
    <>
      <table ref={table} className="stack-wide w-full table-fixed border-collapse text-[13px]">
        <colgroup>
          <col style={{ width: pct(3) }} />
          <col style={{ width: pct(4) }} />
          {fields.map((f, i) => [
            i === receivedAt ? <col key="rb" style={{ width: pct(10) }} /> : null,
            <col key={String(f.key)} style={{ width: pct(widthOf(f)) }} />,
          ])}
          {receivedAt === fields.length && <col style={{ width: pct(10) }} />}
          <col style={{ width: pct(6) }} />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-brand-50 text-left text-[11px] font-semibold uppercase leading-tight tracking-wide text-brand-700">
            <th className="border-b border-line px-1.5 py-2 text-center">
              <input type="checkbox" aria-label="Select all shown rows" title="Received / include in Generate & Transmit (all shown rows)" className="h-4 w-4 accent-brand-600" checked={allOn} onChange={() => onCheck(rows.map((e) => e.id), !allOn)} />
            </th>
            <th className="border-b border-l border-line px-1.5 py-2 text-center">#</th>
            {fields.map((f, i) => [
              i === receivedAt ? <th key="rb" className="border-b border-l border-line px-1.5 py-2">Received by</th> : null,
              <th key={String(f.key)} className="border-b border-l border-line px-1.5 py-2">
                {f.label.replace(' (internal note, not printed)', '').replace(' (printed)', '')}
              </th>,
            ])}
            {receivedAt === fields.length && <th className="border-b border-l border-line px-1.5 py-2">Received by</th>}
            <th className="border-b border-l border-line" />
          </tr>
        </thead>
        <tbody>
          {rows.map((e, ri) => {
            const can = editable(e);
            const checked = isChecked(e);
            const fresh = Date.now() - new Date(e.created_at).getTime() < 30000;
            const t = e.transmittal_id ? transmittals.get(e.transmittal_id) : undefined;
            return (
              <tr key={e.id} className={`border-b border-line ${checked ? 'bg-brand-50/70' : fresh ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''} ${!can ? 'text-muted' : ''}`}>
                <td className="px-1.5 py-2 text-center align-top">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    aria-label={checked ? 'Received — click to undo' : 'Mark as received'}
                    checked={checked}
                    onChange={() => onCheck([e.id], !checked)}
                  />
                </td>
                <td className="border-l border-line px-0.5 py-1 text-center align-top">
                  <NumberCell index={ri + 1} onMove={(n) => reorder.setPosition(e.id, n)} />
                  {e.status === 'transmitted' ? (
                    <span title={`Transmitted${t ? ` (${t.code})` : ''}${can ? ' — editing allowed' : ' — locked'}`} className={`inline-block ${can ? 'text-amber-600' : 'text-muted'}`}>
                      <Icon name="lock" size={11} />
                    </span>
                  ) : e.status === 'submitted' ? (
                    <span title={`Submitted${e.submitted_at ? ' ' + fmtLong(e.submitted_at) : ''}`} className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
                  ) : null}
                </td>
                {fields.map((f, ci) => [
                  ci === receivedAt ? receivedCell(e, checked) : null,
                  <td key={String(f.key)} className="border-l border-line p-0 align-top">
                    <CellEditor
                      initial={String((e as unknown as Record<string, unknown>)[f.key] ?? '')}
                      render={(value, setValue) =>
                        cell(f, value, {
                          disabled: !can,
                          dataCell: `r-${ri}-${ci}`,
                          onChange: setValue,
                          onCommit: (v) => commitCell(e, f, String(f.key), v),
                          onKeyDown: (ev) => {
                            if (ev.key === 'Enter') {
                              ev.preventDefault();
                              (ev.target as HTMLElement).blur();
                              focus(ri + 1, ci);
                            }
                          },
                        })
                      }
                    />
                    {f.key === 'request' && needsDetails(e.request) && (
                      <CellEditor
                        initial={e.request_details ?? ''}
                        render={(value, setValue) => (
                          <AutoTextarea className={`${cellCls} border-t border-dashed border-line text-xs`} aria-label="Raffle items" disabled={!can} value={value} onChange={(ev) => setValue(ev.target.value)} onBlur={(ev) => commitCell(e, null, 'request_details', ev.target.value)} />
                        )}
                      />
                    )}
                  </td>,
                ])}
                {receivedAt === fields.length && receivedCell(e, checked)}
                <td className="border-l border-line px-0.5 py-1 text-right align-top">
                  <div className="flex flex-wrap items-center justify-end">
                    {e.attachment_paths?.length ? (
                      <span className="flex items-center text-[11px] text-muted" title={`${e.attachment_paths.length} attachment(s)`}>
                        <Icon name="paperclip" size={12} />
                        {e.attachment_paths.length}
                      </span>
                    ) : null}
                    <button className="rounded-md p-1 text-muted hover:bg-brand-50 hover:text-brand-600" onClick={() => onDetails(e)} title={can ? 'Edit (full form, attachments)' : 'View'} aria-label="Edit">
                      <Icon name="pencil" size={15} />
                    </button>
                    {(e.status !== 'transmitted' || can) && (
                      <button className="rounded-md p-1 text-muted hover:bg-red-50 hover:text-red-600" onClick={() => onDelete(e)} title="Delete" aria-label="Delete">
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {/* ---------- empty row(s) for the next requests ---------- */}
          {pending.map((r, pi) => (
            <tr key={`new-${pi}`} className="border-b border-dashed border-brand-500/40 bg-brand-50/30">
              <td />
              <td className="border-l border-line" />
              {fields.map((f, ci) => [
                ci === receivedAt ? <td key="rb" className="border-l border-line" /> : null,
                <td key={String(f.key)} className="border-l border-line p-0 align-top">
                  {cell(f, r[f.key] ?? '', {
                    dataCell: `new-${pi}-${ci}`,
                    invalid: missing[pi]?.includes(String(f.key)),
                    onChange: (v) => setPendingCell(pi, String(f.key), v),
                    onCommit: (v) => {
                      const value = clean(f, v);
                      const extra = placeSplit(String(f.key), value, r.barangay ?? '');
                      setPending((list) => list.map((row, i) => (i === pi ? { ...row, [f.key]: value, ...Object.fromEntries(Object.entries(extra).map(([k, x]) => [k, x ?? ''])) } : row)));
                    },
                    onPaste: (ev) => onPaste(ev, pi, ci),
                    onKeyDown: (ev) => {
                      if (ev.key !== 'Enter') return;
                      ev.preventDefault();
                      if (isEmpty(r)) return;
                      savePending([pi]);
                    },
                  })}
                  {f.key === 'request' && needsDetails(r.request) && (
                    <AutoTextarea className={`${cellCls} border-t border-dashed border-line text-xs`} aria-label="Raffle items" placeholder="Raffle items" value={r.request_details ?? ''} onChange={(ev) => setPendingCell(pi, 'request_details', ev.target.value)} />
                  )}
                </td>,
              ])}
              {receivedAt === fields.length && <td className="border-l border-line" />}
              <td className="border-l border-line" />
            </tr>
          ))}
        </tbody>
      </table>
      {pendingCount > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-line p-2">
          <Button size="sm" variant="secondary" onClick={() => setPending([blank()])}>Discard pasted rows</Button>
          <Button size="sm" busy={saving} onClick={() => savePending(pending.map((_, i) => i).filter((i) => !isEmpty(pending[i])))}>
            Save pasted rows ({pendingCount})
          </Button>
        </div>
      )}
    </>
  );
}

/** Row number; type another number to move the row there. */
function NumberCell({ index, onMove }: { index: number; onMove: (n: number) => void }) {
  const [v, setV] = useState(String(index));
  useEffect(() => setV(String(index)), [index]);
  return (
    <input
      aria-label="Row number (type to move)"
      title="Type a number to move this row"
      className="w-full rounded border border-transparent bg-transparent py-1 text-center text-xs tabular-nums text-muted hover:border-line focus:border-brand-500 focus:text-ink focus:outline-none"
      value={v}
      inputMode="numeric"
      onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
      onBlur={() => (Number(v) && Number(v) !== index ? onMove(Number(v)) : setV(String(index)))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Keeps a cell's typed value while it is focused, and follows live updates otherwise. */
function CellEditor({ initial, render }: { initial: string; render: (value: string, set: (v: string) => void) => React.ReactNode }) {
  const [value, setValue] = useState(initial);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setValue(initial);
  }, [initial]);
  return (
    <div onFocus={() => (focused.current = true)} onBlur={() => (focused.current = false)}>
      {render(value, setValue)}
    </div>
  );
}
