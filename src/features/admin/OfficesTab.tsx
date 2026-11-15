'use client';
// Admin › Offices & permissions: offices, their permissions, and the city logo.
import { Icon } from '@/components/ui/Icon';
import { useRef, useState } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase/client';
import type { Committee } from '@/lib/types';
import { LOGO_PATH, Logo } from '@/features/shell/Logo';
import { useCommittees } from './useCommittees';

export function OfficesTab() {
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
      <BrandingCard />
      <div className="card">
        <table className="table-base">
          <thead><tr><th>Office name</th><th>SPM code name</th><th>Prefix</th><th title="May edit and delete its own records after transmitting, and publish the weekly list in Published (All)">Edit / delete / publish</th><th title="May encode and edit the Budget module">Budget</th></tr></thead>
          <tbody>
            {(committees.data ?? []).map((c) => (
              <tr key={c.id}>
                {(['name', 'spm_name', 'code_prefix'] as const).map((k) => (
                  <td key={k}>
                    <input className="input py-1" defaultValue={c[k] ?? ''} onBlur={(e) => e.target.value !== (c[k] ?? '') && save({ [k]: e.target.value }, c.id)} />
                  </td>
                ))}
                {(['can_edit_published', 'can_budget'] as const).map((k) => (
                  <td key={k}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!c[k]} onChange={(e) => save({ [k]: e.target.checked }, c.id)} />
                      Allowed
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BrandingCard() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [key, setKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase().storage.from('branding').upload(LOGO_PATH, file, { upsert: true, contentType: file.type, cacheControl: '60' });
    setBusy(false);
    if (error) return setMsg({ kind: 'error', text: error.message });
    try {
      localStorage.setItem('logo-version', String(Date.now()));
    } catch {}
    setKey((k) => k + 1);
    setMsg({ kind: 'ok', text: 'Logo updated. Other users see it after refreshing the page.' });
  };
  return (
    <div className="card flex flex-wrap items-center gap-4 p-4">
      <div className="rounded-lg bg-civic-900 p-2"><Logo key={key} size={48} /></div>
      <div className="min-w-0 flex-1 basis-40">
        <div className="text-sm font-semibold">City logo</div>
        <div className="text-xs text-muted">Shown in the sidebar and login page. PNG or SVG with a transparent background works best.</div>
        {msg && <div className="mt-2"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      <Button variant="secondary" className="w-full sm:w-auto" busy={busy} onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />Upload logo</Button>
    </div>
  );
}
