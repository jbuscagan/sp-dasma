'use client';
// Barangays + organizations for type-ahead fields. Loaded once and kept live.
import { useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { must, useLive } from '@/hooks/useLive';
import type { Organization } from '@/lib/types';
import type { ComboOption } from '@/components/ui/Combobox';

export function useDirectory() {
  const { data } = useLive(
    async () => {
      const [b, o] = await Promise.all([
        supabase().from('barangays').select('name').order('name'),
        supabase().from('organizations').select('id,name').order('name').limit(5000),
      ]);
      return { barangays: must(b).map((x: { name: string }) => x.name), orgs: must(o) as Organization[] };
    },
    ['organizations', 'barangays'],
  );

  return useMemo(() => {
    const barangays = data?.barangays ?? [];
    const orgs = data?.orgs ?? [];
    return {
      barangays,
      orgs,
      barangayOptions: barangays.map((b): ComboOption => ({ label: b, value: b })),
      orgOptions: orgs.map(
        (o): ComboOption<Organization> => ({ label: o.name, value: o.name, data: o }),
      ),
    };
  }, [data]);
}
