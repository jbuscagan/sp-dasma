'use client';
// Admin › Barangays & organizations: the lists used by the type-ahead fields.
import { useState } from 'react';
import { Alert, Button, Modal } from '@/components/ui';
import { supabase } from '@/lib/supabase/client';
import { T } from '@/lib/db';
import { must, useLive } from '@/hooks/useLive';
import type { Organization } from '@/lib/types';
import { ImportDialog } from './ImportDialog';

/** Removes some (ids) or all (null) barangays / organizations. Requests that used them simply lose that link. */
async function removeMany(kind: 'barangays' | 'organizations', ids: (string | number)[] | null): Promise<string> {
  const { data, error } = await supabase().rpc(kind === 'barangays' ? 'remove_barangays' : 'remove_organizations', { p_ids: ids });
  if (error) throw new Error(error.message);
  return `Removed ${data ?? 0} ${kind}.`;
}

function confirmRemove(kind: string, count: number | 'all'): boolean {
  const what = count === 'all' ? `ALL ${kind}` : `${count} ${kind}`;
  if (!confirm(`Remove ${what}?\n\nRequests that use ${count === 'all' ? 'them' : 'it/them'} keep everything else but will show no ${kind === 'barangays' ? 'barangay' : 'organization'}.${kind === 'barangays' ? ' Their budget rows are removed too.' : ''}`)) return false;
  if (count === 'all') return prompt(`To remove ALL ${kind}, type DELETE`) === 'DELETE';
  return true;
}

export function DirectoryTab() {
  const brgy = useLive(async () => must(await supabase().from('barangays').select('*').order('name')) as { id: number; name: string }[], ['barangays']);
  const [newBrgy, setNewBrgy] = useState('');
  const [pickedB, setPickedB] = useState<Set<number>>(new Set());
  const [notice, setNotice] = useState('');
  const removeB = async (ids: number[] | null, count: number | 'all') => {
    if (!confirmRemove('barangays', count)) return;
    try {
      setNotice(await removeMany('barangays', ids));
      setPickedB(new Set());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
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
      {notice && !error && <div className="lg:col-span-2"><Alert kind="ok">{notice}</Alert></div>}
      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">Barangays ({brgy.data?.length ?? 0})</h3>
          {pickedB.size > 0 && <Button size="sm" variant="secondary" className="text-red-600" onClick={() => removeB(Array.from(pickedB), pickedB.size)}>Remove selected ({pickedB.size})</Button>}
          <Button size="sm" variant="ghost" className="text-red-600" disabled={!brgy.data?.length} onClick={() => removeB(null, 'all')}>Remove all</Button>
        </div>
        <div className="mb-3 flex gap-2">
          <input className="input" value={newBrgy} onChange={(e) => setNewBrgy(e.target.value)} placeholder="New barangay" />
          <Button disabled={!newBrgy.trim()} onClick={async () => { await act(supabase().from('barangays').insert({ name: newBrgy.trim() })); setNewBrgy(''); }}>Add</Button>
        </div>
        <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto text-sm">
          {(brgy.data ?? []).map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 py-1">
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-brand-600" aria-label={`Select ${b.name}`} checked={pickedB.has(b.id)} onChange={() => setPickedB((x) => { const n = new Set(x); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })} />
              {/* Renaming here changes the name on every request and budget at once (the name is stored only here). */}
              <input
                className="input py-1"
                defaultValue={b.name}
                aria-label="Barangay name"
                onBlur={(e) => e.target.value.trim() && e.target.value !== b.name && act(supabase().from('barangays').update({ name: e.target.value.trim() }).eq('id', b.id))}
              />
              <button className="text-xs text-red-600 hover:underline" onClick={() => removeB([b.id], 1)}>Remove</button>
            </li>
          ))}
        </ul>
      </section>
      <Organizations onError={setError} onNotice={setNotice} />
    </div>
  );
}

/** One record per organization. The barangays / chapters are taken from the transmittals that use it. */

function Organizations({ onError, onNotice }: { onError: (m: string) => void; onNotice: (m: string) => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const removeO = async (ids: string[] | null, count: number | 'all') => {
    if (!confirmRemove('organizations', count)) return;
    try {
      onNotice(await removeMany('organizations', ids));
      setPicked(new Set());
      onError('');
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const orgs = useLive(async () => must(await supabase().from('organizations').select('id,name').order('name')) as Organization[], ['organizations']);
  const usage = useLive(async () => {
    const rows = must(await supabase().from(T.entries).select('organization_id,barangay').not('organization_id', 'is', null).limit(20000)) as { organization_id: string; barangay: string | null }[];
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
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Organizations ({orgs.data?.length ?? 0})</h3>
        {picked.size > 0 && <Button size="sm" variant="secondary" className="text-red-600" onClick={() => removeO(Array.from(picked), picked.size)}>Remove selected ({picked.size})</Button>}
        <Button size="sm" variant="ghost" className="text-red-600" disabled={!orgs.data?.length} onClick={() => removeO(null, 'all')}>Remove all</Button>
      </div>
      <p className="mb-3 text-xs text-muted">
        One record per organization (e.g. KBDM); the barangay is chosen on each transmittal. New names typed by encoders are added automatically; merge duplicates here.
      </p>
      <div className="mb-3 flex gap-2">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Organization name" />
        <Button disabled={!name.trim()} onClick={async () => { await act(supabase().from('organizations').insert({ name: name.trim() })); setName(''); }}>Add</Button>
      </div>
      <input className="input mb-2" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-[55vh] overflow-y-auto">
        <table className="table-base">
          <thead><tr><th className="w-8"><input type="checkbox" className="h-4 w-4 accent-brand-600" aria-label="Select all shown" checked={list.length > 0 && list.every((o) => picked.has(o.id))} onChange={(e) => setPicked(e.target.checked ? new Set(list.map((o) => o.id)) : new Set())} /></th><th>Name</th><th>Barangays used</th><th /></tr></thead>
          <tbody>
            {list.map((o) => {
              const used = Array.from(usage.data?.get(o.id) ?? []);
              return (
                <tr key={o.id}>
                  <td><input type="checkbox" className="h-4 w-4 accent-brand-600" aria-label={`Select ${o.name}`} checked={picked.has(o.id)} onChange={() => setPicked((x) => { const n = new Set(x); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); return n; })} /></td>
                  <td><input className="input py-1" defaultValue={o.name} onBlur={(e) => e.target.value.trim() && e.target.value !== o.name && act(supabase().from('organizations').update({ name: e.target.value.trim() }).eq('id', o.id))} /></td>
                  <td className="text-xs text-muted" title={used.join(', ')}>{used.length ? `${used.length}: ${used.slice(0, 4).join(', ')}${used.length > 4 ? '…' : ''}` : '—'}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="mr-3 text-xs text-brand-600 hover:underline" onClick={() => { setMergeFrom(o); setMergeInto(''); }}>Merge…</button>
                    <button className="text-xs text-red-600 hover:underline" onClick={() => removeO([o.id], 1)}>Remove</button>
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
