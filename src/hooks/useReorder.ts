'use client';
// Drag & drop + "type a position number" reordering for table rows.
// Works on a FILTERED view too: the moved row is placed next to its new neighbour in the full list.
import { useState } from 'react';

/** Moves `id` before/after `targetId` inside the full order. */
export function moveNextTo(full: string[], id: string, targetId: string, after: boolean): string[] {
  if (id === targetId) return full;
  const rest = full.filter((x) => x !== id);
  const at = rest.indexOf(targetId);
  if (at < 0) return full;
  rest.splice(after ? at + 1 : at, 0, id);
  return rest;
}

/** Puts `id` at 1-based position `pos` of the visible rows (clamped), keeping hidden rows in place. */
export function moveToPosition(full: string[], visible: string[], id: string, pos: number): string[] {
  const others = visible.filter((x) => x !== id);
  if (!others.length) return full;
  const p = Math.max(1, Math.min(Math.round(pos) || 1, others.length + 1));
  return p <= others.length ? moveNextTo(full, id, others[p - 1], false) : moveNextTo(full, id, others[others.length - 1], true);
}

export interface Reorder {
  enabled: boolean;
  dragOver: { id: string; after: boolean } | null;
  handleProps: (id: string) => React.HTMLAttributes<HTMLElement>;
  rowProps: (id: string) => React.HTMLAttributes<HTMLTableRowElement> & { draggable?: boolean };
  setPosition: (id: string, pos: number) => void;
}

export function useReorder(full: string[], visible: string[], commit: (order: string[]) => void, enabled = true): Reorder {
  const [armed, setArmed] = useState<string | null>(null); // row whose handle is pressed
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ id: string; after: boolean } | null>(null);

  return {
    enabled,
    dragOver,
    handleProps: (id) => ({
      onMouseDown: () => setArmed(id),
      onMouseUp: () => setArmed(null),
      title: 'Drag to move',
      style: { cursor: 'grab' },
    }),
    rowProps: (id) =>
      !enabled
        ? {}
        : {
            draggable: armed === id,
            onDragStart: (e) => {
              setDragging(id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', id);
            },
            onDragOver: (e) => {
              if (!dragging) return;
              e.preventDefault();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const after = e.clientY > r.top + r.height / 2;
              if (dragOver?.id !== id || dragOver.after !== after) setDragOver({ id, after });
            },
            onDrop: (e) => {
              e.preventDefault();
              if (dragging && dragOver) commit(moveNextTo(full, dragging, dragOver.id, dragOver.after));
              setDragging(null);
              setDragOver(null);
              setArmed(null);
            },
            onDragEnd: () => {
              setDragging(null);
              setDragOver(null);
              setArmed(null);
            },
          },
    setPosition: (id, pos) => commit(moveToPosition(full, visible, id, pos)),
  };
}
