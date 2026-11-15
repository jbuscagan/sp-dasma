// All offices, kept up to date live.
import { supabase } from '@/lib/supabase/client';
import { must, useLive } from '@/hooks/useLive';
import type { Committee } from '@/lib/types';

export function useCommittees() {
  return useLive(async () => must(await supabase().from('committees').select('*').order('name')) as Committee[], ['committees']);
}
