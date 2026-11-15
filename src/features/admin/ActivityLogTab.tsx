'use client';
// Admin › Activity log: who did what and when (read-only).
import { useState } from 'react';
import { Alert, Badge } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { supabase } from '@/lib/supabase/client';
import { must, useLive } from '@/hooks/useLive';
import type { Profile } from '@/lib/types';

interface AuditRow {
  id: number;
  at: string;
  user_id: string | null;
  committee_id: string | null;
  action: string;
  table_name: string;
  summary: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
}

const ACTION_COLOR: Record<string, 'gray' | 'blue' | 'green' | 'amber' | 'red'> = {
  create: 'gray', edit: 'blue', submit: 'blue', publish: 'green', received: 'green', archive: 'amber', restore: 'gray', delete: 'red', unpublish: 'red', revision: 'amber', permission: 'amber',
};

/** Who created, edited, submitted, published or deleted what (written by the database, cannot be changed). */

export function ActivityLogTab() {
  const { committees, committeeName } = useSession();
  const [office, setOffice] = useState('');
  const [action, setAction] = useState('');
  const people = useLive(async () => new Map(((must(await supabase().from('profiles').select('id,encoder_name,email')) as Profile[]) ?? []).map((p) => [p.id, p.encoder_name || p.email || '—'])), ['profiles']);
  const log = useLive(async () => {
    let q = supabase().from('audit_log').select('*').order('at', { ascending: false }).limit(300);
    if (office) q = q.eq('committee_id', office);
    if (action) q = q.eq('action', action);
    return must(await q) as AuditRow[];
  }, ['audit_log'], [office, action]);

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap gap-3 p-3">
        <select className="input w-auto" value={office} onChange={(e) => setOffice(e.target.value)}>
          <option value="">All offices</option>
          {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input w-auto" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {Object.keys(ACTION_COLOR).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="ml-auto self-center text-xs text-muted">Latest 300 · updates live</span>
      </div>
      {log.error && <Alert kind="error">{log.error}</Alert>}
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>When</th><th>Who</th><th>Office</th><th>Action</th><th>Record</th><th>Changed</th></tr></thead>
          <tbody>
            {(log.data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs">{new Date(r.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td className="text-xs">{r.user_id ? people.data?.get(r.user_id) ?? '—' : 'System'}</td>
                <td className="text-xs">{committeeName(r.committee_id)}</td>
                <td><Badge color={ACTION_COLOR[r.action] ?? 'gray'}>{r.action}</Badge></td>
                <td className="text-sm">{r.summary}</td>
                <td className="max-w-xs text-xs text-muted">
                  {r.changes && r.action !== 'delete'
                    ? Object.entries(r.changes)
                        .filter(([k]) => !['received_marked_by', 'organization_id', 'transmittal_id'].includes(k))
                        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v?.from ?? '—')} → ${String(v?.to ?? '—')}`)
                        .join(' · ')
                    : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!log.data?.length && <p className="p-6 text-center text-sm text-muted">No activity yet.</p>}
      </div>
    </div>
  );
}

/** Offices asking to change a published (locked) transmittal. */
