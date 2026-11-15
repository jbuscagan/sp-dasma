'use client';
// Admin › Accounts: approve registrations, assign offices and roles.
import { useState } from 'react';
import { Alert, Badge, Button } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { supabase } from '@/lib/supabase/client';
import { must, useLive } from '@/hooks/useLive';
import { fmtLong } from '@/lib/dates';
import type { Profile } from '@/lib/types';
import { useCommittees } from './useCommittees';

export function AccountsTab() {
  const { profile: me } = useSession();
  const users = useLive(async () => must(await supabase().from('profiles').select('*').order('created_at', { ascending: false })) as Profile[], ['profiles']);
  const committees = useCommittees();
  const [error, setError] = useState('');

  const update = async (p: Profile, patch: Partial<Profile>) => {
    setError('');
    const { error } = await supabase().from('profiles').update(patch).eq('id', p.id);
    if (error) setError(error.message);
  };

  /** Approve, creating the office from the requested name when it does not exist yet. */
  const approve = async (p: Profile, committeeId: string) => {
    setError('');
    let id = committeeId;
    if (!id) {
      const name = (p.requested_office ?? '').trim();
      if (!name) return setError('Choose an office for this account first.');
      const existing = committees.data?.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (existing) id = existing.id;
      else {
        const res = await supabase().from('committees').insert({ name }).select().single();
        if (res.error) return setError(res.error.message);
        id = res.data.id;
      }
    }
    await update(p, { status: 'approved', committee_id: id });
  };

  const list = users.data ?? [];
  const pending = list.filter((u) => u.status === 'pending');
  const others = list.filter((u) => u.status !== 'pending');

  const row = (u: Profile) => (
    <tr key={u.id}>
      <td>
        <div className="font-medium">{u.encoder_name}</div>
        <div className="text-xs text-muted">{u.position} · {u.email}</div>
      </td>
      <td className="text-xs">{u.requested_office}<div className="text-muted">{u.created_at && fmtLong(u.created_at)}</div></td>
      <td>
        <select
          className="input py-1"
          value={u.committee_id ?? ''}
          onChange={(e) => (u.status === 'pending' ? approve(u, e.target.value) : update(u, { committee_id: e.target.value || null }))}
        >
          <option value="">{u.status === 'pending' ? '— create from requested name —' : '— none —'}</option>
          {(committees.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </td>
      <td>
        <select className="input py-1" value={u.role} disabled={u.id === me.id} onChange={(e) => update(u, { role: e.target.value as Profile['role'] })}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td><Badge color={u.status === 'approved' ? 'green' : u.status === 'pending' ? 'amber' : 'red'}>{u.status}</Badge></td>
      <td className="whitespace-nowrap text-right">
        {u.status !== 'approved' && <Button size="sm" onClick={() => approve(u, u.committee_id ?? '')}>Approve</Button>}
        {u.status !== 'rejected' && u.id !== me.id && (
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => update(u, { status: 'rejected' })}>
            {u.status === 'approved' ? 'Revoke' : 'Reject'}
          </Button>
        )}
      </td>
    </tr>
  );

  return (
    <div className="space-y-4">
      {error && <Alert kind="error">{error}</Alert>}
      {[['Waiting for approval', pending], ['All accounts', others]].map(([title, rows]) => (
        <section key={title as string} className="card overflow-x-auto">
          <h3 className="border-b border-line px-4 py-3 text-sm font-semibold">{title as string} ({(rows as Profile[]).length})</h3>
          <table className="table-base">
            <thead><tr><th>Encoder</th><th>Requested office</th><th>Office</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>{(rows as Profile[]).map(row)}</tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
