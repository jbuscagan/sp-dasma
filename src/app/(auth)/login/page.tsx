'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { AuthCard } from '@/features/auth/AuthCard';
import { Alert, Button, Field } from '@/components/ui';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Already signed in? Go to the dashboard (at most once every 10 s, so it can never loop).
  useEffect(() => {
    supabase()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) return;
        try {
          const last = Number(sessionStorage.getItem('login-bounce') || 0);
          if (Date.now() - last < 10000) return;
          sessionStorage.setItem('login-bounce', String(Date.now()));
        } catch {
          /* private mode */
        }
        window.location.href = '/';
      });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
    } else {
      window.location.href = '/';
    }
  };

  return (
    <AuthCard title="Committee Platform" subtitle="Sign in with your committee account.">
      <form onSubmit={submit} className="space-y-3">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Email">
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Password">
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <Button type="submit" busy={busy} className="w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        No account yet?{' '}
        <Link href="/register" className="font-semibold text-brand-600 hover:underline">
          Register your committee
        </Link>
      </p>
    </AuthCard>
  );
}
