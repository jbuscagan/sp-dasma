'use client';
// Admin › Barangays & organizations: the lists used by the type-ahead fields.
import { useState } from 'react';
import { Alert, Button, Modal } from '@/components/ui';
import { supabase } from '@/lib/supabase/client';
import { T } from '@/lib/db';
import { must, useLive } from '@/hooks/useLive';
import type { Organization } from '@/lib/types';
import { ImportDialog } from './ImportDialog';

export function DirectoryTab() {
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
            <li key={b.id} className="flex items-center justify-between gap-2 py-1">
              {/* Renaming here changes the name on every request and budget at once (the name is stored only here). */}
              <input
                className="input py-1"
                defaultValue={b.name}
                aria-label="Barangay name"
                onBlur={(e) => e.target.value.trim() && e.target.value !== b.name && act(supabase().from('barangays').update({ name: e.target.value.trim() }).eq('id', b.id))}
              />
              <button className="text-xs text-red-600 hover:underline" onClick={async () => {
                if (!confirm(`Remove ${b.name}?`)) return;
                const { error } = await supabase().from('barangays').delete().eq('id', b.id);
                // A barangay used by requests or budgets cannot be removed (so no record loses its barangay); rename it instead.
                setError(error ? (error.code === '23503' ? `${b.name} is used by saved requests or budgets, so it cannot be removed. You can rename it instead.` : error.message) : '');
              }}>Remove</button>
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
