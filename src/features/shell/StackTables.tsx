'use client';
// Phones: every data table on the page becomes a list of cards (see ".stack" rules in globals.css).
// For that, each cell needs to know its column name; this copies the header text into every cell
// as data-label="…", and keeps doing so when rows are added or changed. Nothing to do per table.
// A table can opt out with className "no-stack".
import { useEffect, type RefObject } from 'react';

/** Narrow cells (checkbox, row number, action buttons) sit side by side instead of one per line. */
const COMPACT = new Set(['', '#', 'no.', 'no']);

function labelTable(table: HTMLTableElement) {
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!headRow) return;
  const labels: string[] = [];
  Array.from(headRow.cells).forEach((th) => {
    const text = (th.textContent ?? '').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < th.colSpan; i++) labels.push(text);
  });
  Array.from(table.tBodies).forEach((body) =>
    Array.from(body.rows).forEach((row) => {
      let col = 0;
      Array.from(row.cells).forEach((cell) => {
        const label = cell.colSpan > 1 ? '' : labels[col] ?? '';
        if (cell.dataset.label !== label) cell.dataset.label = label;
        const compact = COMPACT.has(label.toLowerCase()) ? 'true' : 'false';
        if (cell.dataset.compact !== compact) cell.dataset.compact = compact;
        col += cell.colSpan;
      });
    }),
  );
  table.classList.add('stack');
}

export function useStackTables(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => el.querySelectorAll<HTMLTableElement>('table:not(.no-stack)').forEach(labelTable));
    };
    run();
    // Only added / removed / changed content triggers a new pass (our own attribute changes do not).
    const obs = new MutationObserver(run);
    obs.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      obs.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [root]);
}
