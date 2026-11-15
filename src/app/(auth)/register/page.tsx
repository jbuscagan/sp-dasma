'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { AuthCard } from '@/features/auth/AuthCard';
import { Alert, Button, Field } from '@/components/ui';
import { Combobox } from '@/components/ui/Combobox';

export default function RegisterPage() {
  const [f, setF] = useState({ email: '', password: '', office: '', encoder: '', position: '' });
  const [offices, setOffices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    supabase().from('committees').select('name').order('name').then(({ data }) => setOffices((data ?? []).map((c) => c.name)));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password.length < 8) return setError('Use at least 8 characters for the password.');
    setBusy(true);
    setError('');
    const { data, error } = await supabase().auth.signUp({
      email: f.email,
      password: f.password,
      options: { data: { requested_office: f.office, encoder_name: f.encoder, position: f.position } },
    });
    setBusy(false);
    if (error) return setError(error.message);
    if (data.session) window.location.href = '/';
    else setDone(true); // e-mail confirmation is switched on in Supabase
  };

  if (done) {
    return (
      <AuthCard title="Check your email" subtitle="We sent a confirmation link. After confirming, sign in — an administrator will then approve your account.">
        <Link href="/login" className="text-sm font-semibold text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Register a committee account" subtitle="An administrator reviews every registration before access is granted.">
      <form onSubmit={submit} className="space-y-3">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Office / committee" hint="Pick your office, or type it if it is not listed (e.g. Office of SPM Robin Cantimbuhan).">
          <Combobox value={f.office} onChange={set('office')} options={offices.map((o) => ({ label: o, value: o }))} required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Encoder's name">
            <input className="input" required value={f.encoder} onChange={(e) => set('encoder')(e.target.value)} placeholder="Joseph Aguilar" />
          </Field>
          <Field label="Position">
            <input className="input" required value={f.position} onChange={(e) => set('position')(e.target.value)} placeholder="Administrative Assistant" />
          </Field>
        </div>
        <Field label="Email">
          <input className="input" type="email" required value={f.email} onChange={(e) => set('email')(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Password">
          <input className="input" type="password" required value={f.password} onChange={(e) => set('password')(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button type="submit" busy={busy} className="w-full">
          Register
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Already registered?{' '}
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
