'use client';
// Loads data and reloads it automatically whenever one of the watched tables changes
// (Supabase Realtime). This is what makes every list update without refreshing the page.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

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
      timer = setTimeout(reload, 250); // several changes at once -> one reload
    };
    const channel = supabase().channel(`live-${tableKey}-${++channelSeq}`);
    tableKey.split(',').forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, soon);
    });
    // If live updates are unavailable (network drop), fall back to refreshing every 10 seconds.
    let poll: ReturnType<typeof setInterval> | undefined;
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearInterval(poll);
        poll = undefined;
      } else if (!poll) {
        poll = setInterval(reload, 10000);
      }
    });
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
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
