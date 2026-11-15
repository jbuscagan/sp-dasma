// All database calls for transmittal entries live here (pages never write SQL themselves).
import { supabase } from '@/lib/supabase/client';
import { must } from '@/hooks/useLive';
import type { Entry, EntryInput, EntryStatus, Flag, Submission, Transmittal, TransmittalType } from '@/lib/types';

export interface EntryQuery {
  committeeId?: string | null;
  type?: TransmittalType | null;
  status?: EntryStatus | EntryStatus[];
  from?: string;
  to?: string;
  transmittalId?: string;
}

export async function listEntries(q: EntryQuery): Promise<Entry[]> {
  let req = supabase().from('entries').select('*');
  if (q.committeeId) req = req.eq('committee_id', q.committeeId);
  if (q.type) req = req.eq('type', q.type);
  if (q.status) req = Array.isArray(q.status) ? req.in('status', q.status) : req.eq('status', q.status);
  if (q.from) req = req.gte('date_received', q.from);
  if (q.to) req = req.lte('date_received', q.to);
  if (q.transmittalId) req = req.eq('transmittal_id', q.transmittalId);
  return must(
    await req
      .order('position', { ascending: true, nullsFirst: false })
      .order('date_received', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(5000),
  );
}

/** Saves a new order for the office's own rows (position 1, 2, 3 …). */
export async function reorderEntries(ids: string[]) {
  must(await supabase().rpc('reorder_entries', { p_ids: ids }));
}

/** The office's own arrangement of the published list (other offices' rows cannot be changed). */
export async function getEntryOrder(): Promise<Map<string, number>> {
  const rows = must(await supabase().from('entry_order').select('entry_id,position')) as { entry_id: string; position: number }[];
  return new Map(rows.map((r) => [r.entry_id, r.position]));
}

export async function setEntryOrder(ids: string[]) {
  must(await supabase().rpc('set_entry_order', { p_ids: ids }));
}

// ---------- daily submit ----------
export async function submitEntries(type: TransmittalType): Promise<number> {
  return must(await supabase().rpc('submit_entries', { p_type: type })) as number;
}

export async function listSubmissions(type: TransmittalType, since: string): Promise<Submission[]> {
  return must(await supabase().from('submissions').select('*').eq('type', type).gte('submit_date', since).order('submitted_at', { ascending: false }));
}

// ---------- received (checkbox beside # + "Received by" column) ----------
/**
 * Ticked = received by `name` (the encoder by default); also marks the row for Generate / Publish.
 * Saved in the database, so it survives a refresh. Unticking clears both.
 */
export async function setReceived(ids: string[], on: boolean, name?: string | null) {
  if (!ids.length) return;
  const { data: { user } } = await supabase().auth.getUser();
  must(
    await supabase()
      .from('entries')
      .update(
        on
          ? { received_at: new Date().toISOString(), received_marked_by: user?.id, ...(name !== undefined ? { received_by: name?.trim() || null } : {}) }
          : { received_at: null, received_by: null, received_marked_by: null },
      )
      .in('id', ids),
  );
}

/** Changes only the name in "Received by" (keeps the tick). */
export async function setReceivedBy(id: string, name: string) {
  must(await supabase().from('entries').update({ received_by: name.trim() || null }).eq('id', id));
}

// ---------- revisions of a published (locked) transmittal ----------
export async function requestRevision(id: string, reason: string) {
  must(await supabase().from('transmittals').update({ revision_requested_at: new Date().toISOString(), revision_reason: reason }).eq('id', id));
}

/** Admin only: unlock. Office or admin: lock again (closes the request too). */
export async function setRevisionOpen(id: string, open: boolean) {
  must(
    await supabase()
      .from('transmittals')
      .update(open ? { revision_open: true } : { revision_open: false, revision_requested_at: null, revision_reason: null })
      .eq('id', id),
  );
}

const clean = (input: EntryInput): EntryInput => {
  const out: Record<string, unknown> = {};
  Object.entries(input).forEach(([k, v]) => {
    out[k] = typeof v === 'string' ? v.trim() || null : v;
  });
  if (typeof out.contact_number === 'string') out.contact_number = (out.contact_number as string).replace(/[\s-]/g, '');
  return out as EntryInput;
};

export async function saveEntry(input: EntryInput, id?: string): Promise<Entry> {
  const row = clean(input);
  const sb = supabase();
  const res = id
    ? await sb.from('entries').update(row).eq('id', id).select().single()
    : await sb.from('entries').insert(row).select().single();
  // New organizations are added to the directory by the database itself (one record per organization).
  return must(res) as Entry;
}

export async function deleteEntry(id: string) {
  must(await supabase().from('entries').delete().eq('id', id));
}

export async function setEntryStatus(ids: string[], status: EntryStatus, reason?: string) {
  must(await supabase().from('entries').update({ status, archived_reason: status === 'archived' ? reason ?? null : null }).in('id', ids));
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
  let req = supabase().from('transmittals').select('*');
  if (committeeId) req = req.eq('committee_id', committeeId);
  return must(await req.order('created_at', { ascending: false }).limit(500));
}

/** Admin only: un-publish a transmittal; its entries go back to drafts. */
export async function recallTransmittal(id: string) {
  const sb = supabase();
  must(await sb.from('entries').update({ status: 'draft', transmittal_id: null }).eq('transmittal_id', id).eq('status', 'transmitted'));
  must(await sb.from('transmittals').delete().eq('id', id));
}

// ---------- flags ----------
export async function listFlags(entryIds?: string[]): Promise<Flag[]> {
  let req = supabase().from('entry_flags').select('*');
  if (entryIds) {
    if (!entryIds.length) return [];
    req = req.in('entry_id', entryIds.slice(0, 1000));
  }
  return must(await req.order('created_at', { ascending: false }));
}

export async function addFlag(entryId: string, committeeId: string, note: string) {
  must(await supabase().from('entry_flags').insert({ entry_id: entryId, committee_id: committeeId, note }));
}

export async function resolveFlag(id: string, resolution: string) {
  const { data: { user } } = await supabase().auth.getUser();
  must(
    await supabase()
      .from('entry_flags')
      .update({ status: 'resolved', resolution, resolved_at: new Date().toISOString(), resolved_by: user?.id })
      .eq('id', id),
  );
}

// ---------- attachments (scanned letters) ----------
export async function uploadAttachment(file: Blob, committeeId: string, ext = 'jpg'): Promise<string> {
  const path = `${committeeId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  must(await supabase().storage.from('attachments').upload(path, file, { contentType: file.type || undefined }));
  return path;
}

export async function attachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase().storage.from('attachments').createSignedUrl(path, 600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** Saves only the changed fields of one row (used by the in-table editing). */
export async function patchEntry(id: string, patch: EntryInput): Promise<void> {
  const row = clean(patch);
  must(await supabase().from('entries').update(row).eq('id', id));
}
