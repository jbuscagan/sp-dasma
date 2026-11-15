// Weekly published lists (Published (All) › Publish): one list = records of all offices for a week.
import { supabase } from '@/lib/supabase/client';
import { T } from '@/lib/db';
import { must } from '@/hooks/useLive';
import type { Entry } from '@/lib/types';
import { listEntries } from './entries';

export interface Publication {
  id: string;
  week_no: number | null;
  title: string | null;
  covering: string | null;
  date_from: string | null;
  date_to: string | null;
  published_on: string;
  committee_id: string | null;
  created_at: string;
}

export async function listPublications(): Promise<Publication[]> {
  return must(await supabase().from(T.publications).select('*').order('created_at', { ascending: false }).limit(200));
}

/** The records of one weekly list, in the order they were published. */
export async function publicationEntries(id: string): Promise<Entry[]> {
  const links = must(await supabase().from(T.publicationEntries).select('entry_id,position').eq('publication_id', id).order('position')) as { entry_id: string; position: number }[];
  if (!links.length) return [];
  const rows = await listEntries({ ids: links.map((l) => l.entry_id) });
  const pos = new Map(links.map((l) => [l.entry_id, l.position]));
  return rows.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}

export async function publishWeek(a: { title: string; covering: string; week: number; from: string; to: string; entryIds: string[] }): Promise<string> {
  return must(await supabase().rpc('publish_week', { p_title: a.title, p_covering: a.covering, p_week: a.week, p_from: a.from, p_to: a.to, p_entry_ids: a.entryIds })) as string;
}

export async function deletePublication(id: string) {
  must(await supabase().from(T.publications).delete().eq('id', id));
}
