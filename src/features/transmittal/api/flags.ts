// Remarks / discrepancy flags on published requests.
import { supabase } from '@/lib/supabase/client';
import { T } from '@/lib/db';
import { must } from '@/hooks/useLive';
import type { Flag } from '@/lib/types';

export async function listFlags(entryIds?: string[]): Promise<Flag[]> {
  let req = supabase().from(T.flags).select('*');
  if (entryIds) {
    if (!entryIds.length) return [];
    req = req.in('entry_id', entryIds.slice(0, 1000));
  }
  return must(await req.order('created_at', { ascending: false }));
}

export async function addFlag(entryId: string, committeeId: string, note: string) {
  must(await supabase().from(T.flags).insert({ entry_id: entryId, committee_id: committeeId, note }));
}

export async function resolveFlag(id: string, resolution: string) {
  const { data: { user } } = await supabase().auth.getUser();
  must(await supabase().from(T.flags).update({ status: 'resolved', resolution, resolved_at: new Date().toISOString(), resolved_by: user?.id }).eq('id', id));
}
