'use client';
import { useMemo } from 'react';
import { useLive } from '@/hooks/useLive';
import type { EntryQuery } from '@/features/transmittal/api';
import { listEntries, listFlags } from '@/features/transmittal/api';
import type { Flag } from '@/lib/types';

/** Entries + their remarks/flags, kept live. */
export function useHistoryData(q: EntryQuery, deps: unknown[]) {
  const live = useLive(
    async () => {
      const entries = await listEntries(q);
      const flags = await listFlags(entries.map((e) => e.id));
      return { entries, flags };
    },
    ['entries', 'entry_flags'],
    deps,
  );

  const flags = useMemo(() => {
    const m = new Map<string, Flag[]>();
    live.data?.flags.forEach((f) => m.set(f.entry_id, [...(m.get(f.entry_id) ?? []), f]));
    return m;
  }, [live.data]);

  return { ...live, entries: live.data?.entries ?? [], flags };
}
