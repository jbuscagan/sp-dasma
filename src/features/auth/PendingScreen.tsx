'use client';
import { Logo } from '@/features/shell/Logo';
import { signOut, useSession } from './session';

/** Shown until an administrator approves the account. Updates by itself when approved. */
export function PendingScreen() {
  const { profile } = useSession();
  const rejected = profile.status === 'rejected';
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mb-4 flex justify-center">
          <Logo size={56} />
        </div>
        <h1 className="text-lg font-bold">{rejected ? 'Registration not approved' : 'Waiting for approval'}</h1>
        <p className="mt-2 text-sm text-muted">
          {rejected
            ? 'Your registration was not approved. Please contact the system administrator.'
            : profile.status === 'approved'
              ? 'Your account is approved but not yet linked to an office. The administrator will assign it shortly.'
              : 'Your account has been created. The administrator will review and approve it. This page opens automatically once you are approved.'}
        </p>
        <dl className="mt-5 space-y-1 rounded-lg bg-surface p-3 text-left text-sm">
          <div><dt className="inline text-muted">Email: </dt><dd className="inline">{profile.email}</dd></div>
          <div><dt className="inline text-muted">Office requested: </dt><dd className="inline">{profile.requested_office || '—'}</dd></div>
          <div><dt className="inline text-muted">Encoder: </dt><dd className="inline">{profile.encoder_name} – {profile.position}</dd></div>
        </dl>
        <button onClick={signOut} className="mt-5 text-sm text-brand-600 hover:underline">
          Log out
        </button>
      </div>
    </div>
  );
}
