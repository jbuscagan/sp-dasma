'use client';
// Loads data and reloads it automatically whenever one of the watched tables changes:
//  1. your own saves in this tab → at once (lib/liveBus.ts),
//  2. other people's saves → Supabase's live feed (Realtime),
//  3. safety nets: when you come back to the tab, and every 20 seconds while the tab is open.
// This is what makes every list update without refreshing the page.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { onChange } from '@/lib/liveBus';

let channelSeq = 0;

export function useLive<T>(fetcher: () => Promise<T>, tables: string[], deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const reload = useCallback(async () => {
    try {
      const d = await fetchRef.current();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const tableKey = tables.join(',');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(reload, 150); // several changes at once -> one reload
    };
    const channel = supabase().channel(`live-${tableKey}-${++channelSeq}`);
    tableKey.split(',').forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, soon);
    });
    // If the live feed is unavailable, refresh every 10 seconds instead (every 20 s when it works).
    let fast: ReturnType<typeof setInterval> | undefined;
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearInterval(fast);
        fast = undefined;
      } else if (!fast) {
        fast = setInterval(() => document.visibilityState === 'visible' && reload(), 10000);
      }
    });
    const watched = new Set(tableKey.split(','));
    const offBus = onChange((changed) => {
      if (changed.has('*') || Array.from(changed).some((t) => watched.has(t))) soon();
    });
    const slow = setInterval(() => document.visibilityState === 'visible' && reload(), 20000);
    const back = () => document.visibilityState === 'visible' && soon();
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => {
      clearTimeout(timer);
      clearInterval(fast);
      clearInterval(slow);
      offBus();
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
      supabase().removeChannel(channel);
    };
  }, [tableKey, reload]);

  return { data, error, loading, reload, setData };
}

/** Throws the Supabase error message, otherwise returns the data. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
