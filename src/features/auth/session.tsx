'use client';
// Who is logged in, their office, and the list of all offices — available on every page via useSession().
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import type { Committee, Profile } from '@/lib/types';

interface Session {
  profile: Profile;
  committee: Committee | null;
  committees: Committee[];
  committeeName: (id: string | null | undefined) => string;
  isAdmin: boolean;
  setProfile: (p: Profile) => void;
  setCommittee: (c: Committee) => void;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({
  initialProfile,
  initialCommittees,
  children,
}: {
  initialProfile: Profile;
  initialCommittees: Committee[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [committees, setCommittees] = useState(initialCommittees);

  // If an admin changes my account (approval, committee, role), refresh the whole app.
  useEffect(() => {
    const ch = supabase()
      .channel(`me-${profile.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` }, (p) => {
        const next = p.new as Profile;
        setProfile(next);
        if (next.status !== profile.status || next.committee_id !== profile.committee_id || next.role !== profile.role) {
          router.refresh();
        }
      })
      .subscribe();
    return () => {
      supabase().removeChannel(ch);
    };
  }, [profile.id, profile.status, profile.committee_id, profile.role, router]);

  const value = useMemo<Session>(() => {
    const byId = new Map(committees.map((c) => [c.id, c]));
    return {
      profile,
      committees,
      committee: profile.committee_id ? byId.get(profile.committee_id) ?? null : null,
      committeeName: (id) => (id ? byId.get(id)?.name ?? 'Unknown office' : ''),
      isAdmin: profile.role === 'admin' && profile.status === 'approved',
      setProfile,
      setCommittee: (c) => setCommittees((list) => list.map((x) => (x.id === c.id ? c : x))),
    };
  }, [profile, committees]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
}

export async function signOut() {
  await supabase().auth.signOut();
  window.location.href = '/login';
}
