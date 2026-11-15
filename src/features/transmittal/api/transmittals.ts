// Daily Submit, weekly Transmit (locks records) and revisions of a transmitted list.
import { supabase } from '@/lib/supabase/client';
import { T } from '@/lib/db';
import { must } from '@/hooks/useLive';
import type { Submission, Transmittal, TransmittalType } from '@/lib/types';

export async function submitEntries(type: TransmittalType): Promise<number> {
  return must(await supabase().rpc('submit_entries', { p_type: type })) as number;
}

export async function listSubmissions(type: TransmittalType, since: string): Promise<Submission[]> {
  return must(await supabase().from(T.submissions).select('*').eq('type', type).gte('submit_date', since).order('submitted_at', { ascending: false }));
}

export interface TransmitArgs {
  type: TransmittalType;
  code: string;
  week: number;
  covering: string;
  date: string;
  encoderName: string;
  encoderPosition: string;
  entryIds: string[];
}

export async function transmit(a: TransmitArgs): Promise<string> {
  return must(
    await supabase().rpc('transmit_entries', {
      p_type: a.type,
      p_code: a.code,
      p_week: a.week,
      p_covering: a.covering,
      p_date: a.date,
      p_encoder_name: a.encoderName,
      p_encoder_position: a.encoderPosition,
      p_entry_ids: a.entryIds,
    }),
  ) as string;
}

export async function listTransmittals(committeeId?: string | null): Promise<Transmittal[]> {
  let req = supabase().from(T.transmittals).select('*');
  if (committeeId) req = req.eq('committee_id', committeeId);
  return must(await req.order('created_at', { ascending: false }).limit(500));
}

/** Admin only: un-transmit; its requests go back to drafts. */
export async function recallTransmittal(id: string) {
  const sb = supabase();
  must(await sb.from(T.entries).update({ status: 'draft', transmittal_id: null }).eq('transmittal_id', id).eq('status', 'transmitted'));
  must(await sb.from(T.transmittals).delete().eq('id', id));
}

export async function requestRevision(id: string, reason: string) {
  must(await supabase().from(T.transmittals).update({ revision_requested_at: new Date().toISOString(), revision_reason: reason }).eq('id', id));
}

/** Admin only: unlock. Office or admin: lock again (closes the request too). */
export async function setRevisionOpen(id: string, open: boolean) {
  must(
    await supabase()
      .from(T.transmittals)
      .update(open ? { revision_open: true } : { revision_open: false, revision_requested_at: null, revision_reason: null })
      .eq('id', id),
  );
}
