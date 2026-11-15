'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Field, PageHeader } from '@/components/ui';
import { signOut, useSession } from '@/features/auth/session';
import { getTheme, setTheme, type Theme } from '@/features/shell/theme';
import { officeLine, transmittalCode } from '@/features/reports/header';
import { supabase } from '@/lib/supabase/client';
import { must } from '@/hooks/useLive';
import type { Committee, Profile } from '@/lib/types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const { profile, committee, setProfile, setCommittee } = useSession();
  const [me, setMe] = useState({ encoder_name: profile.encoder_name ?? '', position: profile.position ?? '' });
  const [office, setOffice] = useState({ name: committee?.name ?? '', spm_name: committee?.spm_name ?? '', code_prefix: committee?.code_prefix ?? '' });
  const [password, setPassword] = useState('');
  const [theme, setThemeState] = useState<Theme>('light');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => setThemeState(getTheme()), []);

  const run = (fn: () => Promise<string>) => async () => {
    setMsg(null);
    try {
      setMsg({ kind: 'ok', text: await fn() });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const saveMe = run(async () => {
    const p = must(await supabase().from('profiles').update(me).eq('id', profile.id).select().single()) as Profile;
    setProfile(p);
    return 'Encoder details saved. New reports will use them.';
  });

  const saveOffice = run(async () => {
    if (!committee) throw new Error('No office linked to this account.');
    const c = must(await supabase().from('committees').update(office).eq('id', committee.id).select().single()) as Committee;
    setCommittee(c);
    return 'Office details saved.';
  });

  const changePassword = run(async () => {
    if (password.length < 8) throw new Error('Use at least 8 characters.');
    const { error } = await supabase().auth.updateUser({ password });
    if (error) throw new Error(error.message);
    setPassword('');
    return 'Password changed.';
  });

  const preview: Committee = { id: '', name: office.name, spm_name: office.spm_name || null, code_prefix: office.code_prefix || 'SPM' };

  return (
    <>
      <PageHeader title="Settings" />
      {msg && <div className="mb-4"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="User details">
          <dl className="mb-4 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            <dt className="text-muted">Email</dt><dd>{profile.email}</dd>
            <dt className="text-muted">Role</dt><dd className="capitalize">{profile.role}</dd>
            <dt className="text-muted">Status</dt><dd className="capitalize">{profile.status}</dd>
          </dl>
          <Field label="New password">
            <div className="flex gap-2">
              <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              <Button variant="secondary" onClick={changePassword}>Change</Button>
            </div>
          </Field>
        </Section>

        <Section title="Encoder">
          <p className="mb-3 text-sm text-muted">Printed under every report, e.g. “Joseph Aguilar – Administrative Assistant”.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Encoder's name"><input className="input" value={me.encoder_name} onChange={(e) => setMe({ ...me, encoder_name: e.target.value })} /></Field>
            <Field label="Position"><input className="input" value={me.position} onChange={(e) => setMe({ ...me, position: e.target.value })} /></Field>
          </div>
          <Button className="mt-3" onClick={saveMe}>Save encoder</Button>
        </Section>

        <Section title="Office / committee">
          {committee ? (
            <>
              <div className="grid gap-3">
                <Field label="Office name"><input className="input" value={office.name} onChange={(e) => setOffice({ ...office, name: e.target.value })} /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="SPM code name" hint="Printed as OFFICE OF SPM …"><input className="input" value={office.spm_name} onChange={(e) => setOffice({ ...office, spm_name: e.target.value })} /></Field>
                  <Field label="Code prefix" hint="e.g. SPMRC"><input className="input uppercase" value={office.code_prefix} onChange={(e) => setOffice({ ...office, code_prefix: e.target.value.toUpperCase() })} /></Field>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-surface p-3 text-xs">
                <div className="text-muted">Report preview</div>
                <div className="font-mono font-semibold">{transmittalCode(preview.code_prefix, 'ngo', 45)}</div>
                <div className="font-semibold">{officeLine(preview)}</div>
              </div>
              <Button className="mt-3" onClick={saveOffice}>Save office</Button>
            </>
          ) : (
            <p className="text-sm text-muted">This account is not linked to an office.</p>
          )}
        </Section>

        <Section title="Appearance">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Dark mode</span>
              <span className="text-xs text-muted">Saved on this device.</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={theme === 'dark'}
              onClick={() => {
                const next = theme === 'dark' ? 'light' : 'dark';
                setTheme(next);
                setThemeState(next);
              }}
              className={`relative h-6 w-11 rounded-full transition ${theme === 'dark' ? 'bg-brand-600' : 'bg-line'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${theme === 'dark' ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>
          <hr className="my-4 border-line" />
          <Button variant="danger" onClick={signOut}>Log out</Button>
        </Section>
      </div>
    </>
  );
}
