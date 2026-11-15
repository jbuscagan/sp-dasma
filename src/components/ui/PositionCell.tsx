'use client';
import { useEffect, useState } from 'react';
import type { Reorder } from '@/hooks/useReorder';

/** ⋮⋮ drag handle + editable position number (type 1 to move a row to the top). */
export function PositionCell({ id, index, reorder }: { id: string; index: number; reorder: Reorder }) {
  const [v, setV] = useState(String(index));
  useEffect(() => setV(String(index)), [index]);
  const commit = () => {
    const n = Number(v);
    if (n && n !== index) reorder.setPosition(id, n);
    else setV(String(index));
  };
  return (
    <div className="flex items-center gap-1">
      {reorder.enabled && (
        <span {...reorder.handleProps(id)} className="select-none px-0.5 text-muted hover:text-brand-600" aria-label="Drag to move">
          ⋮⋮
        </span>
      )}
      <input
        aria-label="Position"
        className="w-10 rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-xs tabular-nums text-muted hover:border-line focus:border-brand-500 focus:text-ink focus:outline-none disabled:hover:border-transparent"
        value={v}
        disabled={!reorder.enabled}
        inputMode="numeric"
        onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}
