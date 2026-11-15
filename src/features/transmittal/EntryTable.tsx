'use client';
import type { ReactNode } from 'react';
import { Empty } from '@/components/ui';
import { PositionCell } from '@/components/ui/PositionCell';
import type { Reorder } from '@/hooks/useReorder';
import type { Entry } from '@/lib/types';
import type { ColumnDef } from './config';

export interface ExtraColumn {
  header: string;
  cell: (e: Entry) => ReactNode;
  className?: string;
}

/** Table used by every transmittal and history page. Columns come from config.ts. */
export function EntryTable({
  entries,
  columns,
  selected,
  onSelect,
  extra = [],
  actions,
  rowClass,
  empty = 'Nothing here yet.',
  dense,
  reorder,
}: {
  entries: Entry[];
  columns: ColumnDef[];
  selected?: Set<string>;
  onSelect?: (ids: Set<string>) => void;
  extra?: ExtraColumn[];
  actions?: (e: Entry) => ReactNode;
  rowClass?: (e: Entry) => string;
  empty?: ReactNode;
  dense?: boolean; // smaller text and padding for wide, mixed tables
  reorder?: Reorder; // drag ⋮⋮ / type a position number
}) {
  const allOn = !!selected && entries.length > 0 && entries.every((e) => selected.has(e.id));
  const toggle = (id: string) => {
    if (!selected || !onSelect) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelect(next);
  };

  if (!entries.length) return <Empty>{empty}</Empty>;

  return (
    <div className="overflow-x-auto">
      <table className={`table-base ${dense ? 'text-[13px] [&_td]:px-2 [&_th]:px-2' : ''}`}>
        <thead>
          <tr>
            {selected && (
              <th className="w-8">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allOn}
                  onChange={() => onSelect?.(allOn ? new Set() : new Set(entries.map((e) => e.id)))}
                />
              </th>
            )}
            <th className={reorder ? 'w-[72px]' : 'w-8'}>#</th>
            {columns.map((c) => (
              <th key={c.label}>{c.label}</th>
            ))}
            {extra.map((x) => (
              <th key={x.header}>{x.header}</th>
            ))}
            {actions && <th className="text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr
              key={e.id}
              {...(reorder?.rowProps(e.id) ?? {})}
              className={`${rowClass?.(e) ?? ''} ${
                reorder?.dragOver?.id === e.id ? (reorder.dragOver.after ? 'shadow-[inset_0_-3px_0_rgb(var(--brand-500))]' : 'shadow-[inset_0_3px_0_rgb(var(--brand-500))]') : ''
              }`}
            >
              {selected && (
                <td>
                  <input type="checkbox" aria-label="Select row" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                </td>
              )}
              <td className="text-muted">{reorder ? <PositionCell id={e.id} index={i + 1} reorder={reorder} /> : i + 1}</td>
              {columns.map((c) => (
                <td key={c.label} className={`whitespace-pre-line ${c.italic ? 'italic' : ''}`}>
                  {c.value(e)}
                </td>
              ))}
              {extra.map((x) => (
                <td key={x.header} className={x.className}>
                  {x.cell(e)}
                </td>
              ))}
              {actions && <td className="whitespace-nowrap text-right">{actions(e)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Simple text search across every visible column. */
export function matches(e: Entry, columns: ColumnDef[], q: string) {
  if (!q.trim()) return true;
  const hay = columns.map((c) => c.value(e)).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}
