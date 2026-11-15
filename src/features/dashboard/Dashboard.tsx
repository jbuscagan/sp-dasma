'use client';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import { HeritageArt } from '@/features/shell/HeritageArt';
import { useSession } from '@/features/auth/session';
import { supabase } from '@/lib/supabase/client';
import { must, useLive } from '@/hooks/useLive';
import { fmtLong, todayIso, weekNumber, ordinal } from '@/lib/dates';
import type { Entry, Flag, Transmittal } from '@/lib/types';
import { TYPE_ORDER, TYPES, displayName } from '@/features/transmittal/config';

export function Dashboard() {
  const { profile, committee, committeeName, isAdmin } = useSession();
  const { data } = useLive(
    async () => {
      const sb = supabase();
      const [drafts, recent, flags, pending, tx, revisions] = await Promise.all([
        committee ? sb.from('entries').select('type').eq('committee_id', committee.id).in('status', ['draft', 'submitted']) : Promise.resolve({ data: [], error: null }),
        sb.from('entries').select('*').eq('status', 'transmitted').order('updated_at', { ascending: false }).limit(8),
        sb.from('entry_flags').select('*').eq('status', 'open'),
        isAdmin ? sb.from('profiles').select('id').eq('status', 'pending') : Promise.resolve({ data: [], error: null }),
        committee ? sb.from('transmittals').select('*').eq('committee_id', committee.id).order('created_at', { ascending: false }).limit(5) : Promise.resolve({ data: [], error: null }),
        isAdmin ? sb.from('transmittals').select('id').not('revision_requested_at', 'is', null).eq('revision_open', false) : Promise.resolve({ data: [], error: null }),
      ]);
      return {
        drafts: must(drafts) as { type: Entry['type'] }[],
        recent: must(recent) as Entry[],
        flags: must(flags) as Flag[],
        pending: (must(pending) as unknown[]).length,
        tx: must(tx) as Transmittal[],
        revisions: (must(revisions) as unknown[]).length,
      };
    },
    ['entries', 'entry_flags', 'profiles', 'transmittals'],
    [committee?.id, isAdmin],
  );

  const draftCount = (t: string) => data?.drafts.filter((d) => d.type === t).length ?? 0;
  const today = todayIso();

  return (
    <>
      <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-civic-900 via-civic-800 to-civic-700 p-6 text-white shadow-md sm:p-8">
        <HeritageArt className="pointer-events-none absolute -right-10 -top-6 hidden w-[420px] text-accent/30 sm:block" />
        <div className="relative">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {fmtLong(today)} · {ordinal(weekNumber(today))} week
          </div>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Magandang araw, {profile.encoder_name?.split(' ')[0] ?? ''}!</h1>
          <p className="mt-1 text-sm text-white/80">{committee?.name ?? 'Administrator'}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              ['/transmittal/ngo', '＋ Encode request'],
              ['/history/published', 'Published'],
              ['/dtr', 'DTR'],
              ['/budget', 'Budget'],
            ].map(([href, label], i) => (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${i === 0 ? 'bg-accent text-civic-900 hover:bg-accent' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {isAdmin && (data?.pending ?? 0) > 0 && (
        <Link href="/admin" className="mb-4 block rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <b>{data?.pending}</b> registration(s) waiting for approval →
        </Link>
      )}

      {isAdmin && (data?.revisions ?? 0) > 0 && (
        <Link href="/admin?tab=revisions" className="mb-4 block rounded-xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
          <b>{data?.revisions}</b> request(s) to revise a published transmittal →
        </Link>
      )}

      <h2 className="mb-2 text-sm font-semibold text-muted">Not yet published (draft + submitted)</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {TYPE_ORDER.map((t) => (
          <Link key={t} href={`/transmittal/${t}`} className="card p-4 transition hover:border-brand-500">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">{TYPES[t].label}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">{draftCount(t)}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Latest published requests (all offices)</h2>
            <Link href="/history/published" className="text-xs text-brand-600 hover:underline">See all →</Link>
          </div>
          <ul className="divide-y divide-line">
            {(data?.recent ?? []).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Badge color="blue">{TYPES[e.type].label}</Badge>
                <span className="font-medium">{displayName(e).split('\n').pop()}</span>
                <span className="text-muted">· {e.barangay}</span>
                <span className="ml-auto text-xs text-muted">{committeeName(e.committee_id)}</span>
              </li>
            ))}
            {!data?.recent.length && <li className="py-6 text-center text-sm text-muted">Nothing published yet.</li>}
          </ul>
        </section>
        <section className="space-y-4">
          <div className="card p-4">
            <h2 className="text-sm font-semibold">Open remarks / discrepancies</h2>
            <div className="mt-1 text-3xl font-bold text-red-600">{data?.flags.length ?? 0}</div>
            <Link href="/history/published" className="text-xs text-brand-600 hover:underline">Review →</Link>
          </div>
          <div className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Our recent transmittals</h2>
            <ul className="space-y-1 text-sm">
              {(data?.tx ?? []).map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <span className="font-mono">{t.code}</span>
                  <span className="text-xs text-muted">{fmtLong(t.transmitted_on)}</span>
                </li>
              ))}
              {!data?.tx.length && <li className="text-muted">None yet.</li>}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
