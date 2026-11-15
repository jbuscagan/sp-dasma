// Requests (entries): list, save, delete, status, order, received.
import { supabase } from '@/lib/supabase/client';
import { T } from '@/lib/db';
import { must } from '@/hooks/useLive';
import { formatPhone } from '@/lib/format';
import type { Entry, EntryInput, EntryStatus, TransmittalType } from '@/lib/types';

export interface EntryQuery {
  committeeId?: string | null;
  type?: TransmittalType | null;
  status?: EntryStatus | EntryStatus[];
  from?: string;
  to?: string;
  transmittalId?: string;
  ids?: string[];
}

export async function listEntries(q: EntryQuery): Promise<Entry[]> {
  let req = supabase().from(T.entries).select('*');
  if (q.committeeId) req = req.eq('committee_id', q.committeeId);
  if (q.type) req = req.eq('type', q.type);
  if (q.status) req = Array.isArray(q.status) ? req.in('status', q.status) : req.eq('status', q.status);
  if (q.from) req = req.gte('date_received', q.from);
  if (q.to) req = req.lte('date_received', q.to);
  if (q.transmittalId) req = req.eq('transmittal_id', q.transmittalId);
  if (q.ids) req = req.in('id', q.ids);
  return must(
    await req
      .order('position', { ascending: true, nullsFirst: false })
      .order('date_received', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(5000),
  );
}

/** Fields shown by the view only (names come from the linked records); never sent back. */
const READ_ONLY: (keyof Entry)[] = ['received_by', 'created_at', 'updated_at'];

/** Trims text, turns empty text into "no value", and writes phone numbers as 09XXXXXXXXX. */
const clean = (input: EntryInput): EntryInput => {
  const out: Record<string, unknown> = {};
  Object.entries(input).forEach(([k, v]) => {
    if ((READ_ONLY as string[]).includes(k)) return;
    out[k] = typeof v === 'string' ? v.trim() || null : v;
  });
  if (typeof out.contact_number === 'string') out.contact_number = formatPhone(out.contact_number) || null;
  return out as EntryInput;
};

/** New request (no id) or full edit. Organization / barangay names are linked by the database. */
export async function saveEntry(input: EntryInput, id?: string): Promise<Entry> {
  const row = clean(input);
  const sb = supabase();
  const res = id ? await sb.from(T.entries).update(row).eq('id', id).select().single() : await sb.from(T.entries).insert(row).select().single();
  return must(res) as Entry;
}

/** Saves only the changed fields of one row (in-table editing). */
export async function patchEntry(id: string, patch: EntryInput): Promise<void> {
  must(await supabase().from(T.entries).update(clean(patch)).eq('id', id));
}

export async function deleteEntry(id: string) {
  must(await supabase().from(T.entries).delete().eq('id', id));
}

export async function setEntryStatus(ids: string[], status: EntryStatus, reason?: string) {
  must(await supabase().from(T.entries).update({ status, archived_reason: status === 'archived' ? reason ?? null : null }).in('id', ids));
}

/** Ticked = received by the given office (also marks the row for Generate / Transmit). Unticking clears it. */
export async function setReceived(ids: string[], on: boolean, officeId?: string | null) {
  if (!ids.length) return;
  const { data: { user } } = await supabase().auth.getUser();
  must(
    await supabase()
      .from(T.entries)
      .update(
        on
          ? { received_at: new Date().toISOString(), received_marked_by: user?.id, received_committee_id: officeId ?? null }
          : { received_at: null, received_committee_id: null, received_marked_by: null },
      )
      .in('id', ids),
  );
}

// ---------- order ----------
/** Saves a new order for the office's own rows (position 1, 2, 3 …). */
export async function reorderEntries(ids: string[]) {
  must(await supabase().rpc('reorder_entries', { p_ids: ids }));
}

/** The office's own arrangement of the published list (other offices' rows cannot be changed). */
export async function getEntryOrder(): Promise<Map<string, number>> {
  const rows = must(await supabase().from(T.entryOrder).select('entry_id,position')) as { entry_id: string; position: number }[];
  return new Map(rows.map((r) => [r.entry_id, r.position]));
}

export async function setEntryOrder(ids: string[]) {
  must(await supabase().rpc('set_entry_order', { p_ids: ids }));
}
