import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { SessionProvider } from '@/features/auth/session';
import { AppShell } from '@/features/shell/AppShell';
import { PendingScreen } from '@/features/auth/PendingScreen';
import type { Committee, Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: committees }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', user.id).single<Profile>(),
    sb.from('committees').select('*').order('name'),
  ]);

  if (!profile) redirect('/login');

  const ready = profile.status === 'approved' && (profile.committee_id || profile.role === 'admin');

  return (
    <SessionProvider initialProfile={profile} initialCommittees={(committees ?? []) as Committee[]}>
      {ready ? <AppShell>{children}</AppShell> : <PendingScreen />}
    </SessionProvider>
  );
}
