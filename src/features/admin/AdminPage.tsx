'use client';
// Administrator tools: approve accounts, revisions, office permissions, directory, activity log.
import { useEffect, useState } from 'react';
import { listTransmittals, setRevisionOpen } from '@/features/transmittal/api';
import { TYPES } from '@/features/transmittal/config';
import { Alert, Badge, Button, Field, Modal, PageHeader, Tabs } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { supabase } from '@/lib/supabase/client';
import { must, useLive } from '@/hooks/useLive';
import { fmtLong } from '@/lib/dates';
import type { Committee, Organization, Profile } from '@/lib/types';
import { ImportDialog } from './ImportDialog';

type Tab = 'users' | 'revisions' | 'offices' | 'directory' | 'activity';

export function AdminPage() {
  const { isAdmin } = useSession();
  const [tab, setTab] = useState<Tab>('users');
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'revisions' || t === 'activity') setTab(t);
  }, []);
  if (!isAdmin) return <Alert kind="error">Administrators only.</Alert>;
  return (
    <>
      <PageHeader title="Administration" subtitle="Approve accounts, manage offices and the directory." />
      <Tabs<Tab> value={tab} onChange={setTab} items={[['users', 'Accounts'], ['revisions', 'Revision requests'], ['offices', 'Offices & permissions'], ['directory', 'Barangays & organizations'], ['activity', 'Activity log']]} />
      {tab === 'users' && <Users />}
      {tab === 'revisions' && <Revisions />}
      {tab === 'offices' && <Offices />}
      {tab === 'directory' && <Directory />}
      {tab === 'activity' && <ActivityLog />}
    </>
  );
}

function useCommittees() {
  return useLive(async () => must(await supabase().from('committees').select('*').order('name')) as Committee[], ['committees']);
}

function Users() {
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
      <td>
        <label className="flex items-center gap-1.5 text-xs" title="Can edit the Budget module">
          <input type="checkbox" checked={u.role === 'admin' || !!u.can_budget} disabled={u.role === 'admin'} onChange={(e) => update(u, { can_budget: e.target.checked })} />
          Budget encoder
        </label>
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
            <thead><tr><th>Encoder</th><th>Requested office</th><th>Office</th><th>Role</th><th>Budget</th><th>Status</th><th /></tr></thead>
            <tbody>{(rows as Profile[]).map(row)}</tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function Offices() {
  const committees = useCommittees();
  const [draft, setDraft] = useState({ name: '', spm_name: '', code_prefix: 'SPM' });
  const [error, setError] = useState('');

  const save = async (c: Partial<Committee>, id?: string) => {
    setError('');
    const res = id ? await supabase().from('committees').update(c).eq('id', id) : await supabase().from('committees').insert(c);
    if (res.error) setError(res.error.message);
  };

  return (
    <div className="space-y-4">
      {error && <Alert kind="error">{error}</Alert>}
      <div className="card grid gap-3 p-4 sm:grid-cols-4">
        <Field label="Office name"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Office of SPM Robin Cantimbuhan" /></Field>
        <Field label="SPM code name"><input className="input" value={draft.spm_name} onChange={(e) => setDraft({ ...draft, spm_name: e.target.value })} placeholder="Robin Cantimbuhan" /></Field>
        <Field label="Code prefix"><input className="input uppercase" value={draft.code_prefix} onChange={(e) => setDraft({ ...draft, code_prefix: e.target.value.toUpperCase() })} /></Field>
        <div className="flex items-end">
          <Button className="w-full" disabled={!draft.name.trim()} onClick={async () => { await save(draft); setDraft({ name: '', spm_name: '', code_prefix: 'SPM' }); }}>
            ＋ Add office
          </Button>
        </div>
      </div>
      <Alert kind="info">
        <b>Edit / delete published:</b> offices you tick here may edit and delete <b>their own</b> records after publishing (History › Published). All other
        offices stay locked and must request a revision. Every change is recorded in the Activity log.
      </Alert>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Office name</th><th>SPM code name</th><th>Prefix</th><th title="May edit and delete its own records after publishing">Edit / delete published</th></tr></thead>
          <tbody>
            {(committees.data ?? []).map((c) => (
              <tr key={c.id}>
                {(['name', 'spm_name', 'code_prefix'] as const).map((k) => (
                  <td key={k}>
                    <input className="input py-1" defaultValue={c[k] ?? ''} onBlur={(e) => e.target.value !== (c[k] ?? '') && save({ [k]: e.target.value }, c.id)} />
                  </td>
                ))}
                <td>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!c.can_edit_published} onChange={(e) => save({ can_edit_published: e.target.checked }, c.id)} />
                    {c.can_edit_published ? 'Allowed' : 'Locked'}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Directory() {
  const brgy = useLive(async () => must(await supabase().from('barangays').select('*').order('name')) as { id: number; name: string }[], ['barangays']);
  const [newBrgy, setNewBrgy] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const act = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    setError(error?.message ?? '');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <Button onClick={() => setImporting(true)}>⇪ Import list (Excel / CSV / paste)</Button>
        <span className="text-xs text-muted">Upload the official list of barangays or organizations. Existing entries are kept, duplicates skipped.</span>
      </div>
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      {error && <div className="lg:col-span-2"><Alert kind="error">{error}</Alert></div>}
      <section className="card p-4">
        <h3 className="mb-3 text-sm font-semibold">Barangays ({brgy.data?.length ?? 0})</h3>
        <div className="mb-3 flex gap-2">
          <input className="input" value={newBrgy} onChange={(e) => setNewBrgy(e.target.value)} placeholder="New barangay" />
          <Button disabled={!newBrgy.trim()} onClick={async () => { await act(supabase().from('barangays').insert({ name: newBrgy.trim() })); setNewBrgy(''); }}>Add</Button>
        </div>
        <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto text-sm">
          {(brgy.data ?? []).map((b) => (
            <li key={b.id} className="flex items-center justify-between py-1.5">
              {b.name}
              <button className="text-xs text-red-600 hover:underline" onClick={() => confirm(`Remove ${b.name}?`) && act(supabase().from('barangays').delete().eq('id', b.id))}>Remove</button>
            </li>
          ))}
        </ul>
      </section>
      <Organizations onError={setError} />
    </div>
  );
}

/** One record per organization. The barangays / chapters are taken from the transmittals that use it. */
function Organizations({ onError }: { onError: (m: string) => void }) {
  const orgs = useLive(async () => must(await supabase().from('organizations').select('id,name').order('name')) as Organization[], ['organizations']);
  const usage = useLive(async () => {
    const rows = must(await supabase().from('entries').select('organization_id,barangay').not('organization_id', 'is', null).limit(20000)) as { organization_id: string; barangay: string | null }[];
    const m = new Map<string, Set<string>>();
    rows.forEach((r) => m.set(r.organization_id, (m.get(r.organization_id) ?? new Set()).add(r.barangay || '—')));
    return m;
  }, ['entries']);
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [mergeFrom, setMergeFrom] = useState<Organization | null>(null);
  const [mergeInto, setMergeInto] = useState('');
  const act = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    onError(error?.message ?? '');
  };
  const list = (orgs.data ?? []).filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <section className="card p-4">
      <h3 className="mb-1 text-sm font-semibold">Organizations ({orgs.data?.length ?? 0})</h3>
      <p className="mb-3 text-xs text-muted">
        One record per organization (e.g. KBDM). The barangay or chapter is chosen on each transmittal, so an organization with 75 chapters is still one record.
        New names typed by encoders are added automatically; merge duplicates here.
      </p>
      <div className="mb-3 flex gap-2">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Organization name" />
        <Button disabled={!name.trim()} onClick={async () => { await act(supabase().from('organizations').insert({ name: name.trim() })); setName(''); }}>Add</Button>
      </div>
      <input className="input mb-2" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-[55vh] overflow-y-auto">
        <table className="table-base">
          <thead><tr><th>Name</th><th>Barangays / chapters used</th><th /></tr></thead>
          <tbody>
            {list.map((o) => {
              const used = Array.from(usage.data?.get(o.id) ?? []);
              return (
                <tr key={o.id}>
                  <td><input className="input py-1" defaultValue={o.name} onBlur={(e) => e.target.value.trim() && e.target.value !== o.name && act(supabase().from('organizations').update({ name: e.target.value.trim() }).eq('id', o.id))} /></td>
                  <td className="text-xs text-muted" title={used.join(', ')}>{used.length ? `${used.length}: ${used.slice(0, 4).join(', ')}${used.length > 4 ? '…' : ''}` : '—'}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="mr-3 text-xs text-brand-600 hover:underline" onClick={() => { setMergeFrom(o); setMergeInto(''); }}>Merge…</button>
                    <button className="text-xs text-red-600 hover:underline" onClick={() => confirm(`Delete ${o.name}? Entries keep the name but lose the link.`) && act(supabase().from('organizations').delete().eq('id', o.id))}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Modal
        open={!!mergeFrom}
        onClose={() => setMergeFrom(null)}
        title={`Merge “${mergeFrom?.name ?? ''}”`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMergeFrom(null)}>Cancel</Button>
            <Button disabled={!mergeInto} onClick={async () => { await act(supabase().rpc('merge_organizations', { p_from: mergeFrom!.id, p_into: mergeInto })); setMergeFrom(null); }}>Merge</Button>
          </>
        }
      >
        <p className="mb-3 text-sm">All requests that use <b>{mergeFrom?.name}</b> will use the organization below instead, and the duplicate is removed.</p>
        <select className="input" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
          <option value="">Choose the organization to keep…</option>
          {(orgs.data ?? []).filter((o) => o.id !== mergeFrom?.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </Modal>
    </section>
  );
}

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
function ActivityLog() {
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
function Revisions() {
  const { committeeName } = useSession();
  const tx = useLive(() => listTransmittals(), ['transmittals']);
  const [error, setError] = useState('');
  const list = (tx.data ?? []).filter((t) => t.revision_requested_at || t.revision_open);
  const run = (p: Promise<unknown>) => p.catch((e) => setError(e instanceof Error ? e.message : String(e)));
  return (
    <div className="card overflow-x-auto">
      {error && <div className="p-3"><Alert kind="error">{error}</Alert></div>}
      <table className="table-base">
        <thead><tr><th>Office</th><th>Transmittal</th><th>Reason</th><th>Requested</th><th>Status</th><th /></tr></thead>
        <tbody>
          {list.map((t) => (
            <tr key={t.id}>
              <td className="font-medium">{committeeName(t.committee_id)}</td>
              <td><span className="font-mono text-xs">{t.code}</span><div className="text-xs text-muted">{TYPES[t.type].label}</div></td>
              <td className="max-w-xs text-sm">{t.revision_reason || '—'}</td>
              <td className="text-xs">{t.revision_requested_at ? fmtLong(t.revision_requested_at) : '—'}</td>
              <td>{t.revision_open ? <Badge color="amber">✎ Open</Badge> : <Badge color="blue">⏳ Waiting</Badge>}</td>
              <td className="whitespace-nowrap text-right">
                {t.revision_open ? (
                  <Button size="sm" variant="secondary" onClick={() => run(setRevisionOpen(t.id, false))}>🔒 Lock again</Button>
                ) : (
                  <>
                    <Button size="sm" onClick={() => run(setRevisionOpen(t.id, true))}>Allow revision</Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => run(setRevisionOpen(t.id, false))}>Decline</Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!list.length && <p className="p-6 text-center text-sm text-muted">No revision requests.</p>}
    </div>
  );
}
