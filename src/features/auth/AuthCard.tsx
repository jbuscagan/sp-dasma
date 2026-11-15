import type { ReactNode } from 'react';
import { Logo } from '@/features/shell/Logo';
import { GovBar } from '@/features/shell/GovBar';
import { HeritageArt } from '@/features/shell/HeritageArt';

const FEATURES = [
  'Encode and transmit solicitation requests',
  'Generate reports in PDF, Word or Excel',
  'See every committee’s updates in real time',
  'Daily time records and budget monitoring',
];

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-civic-900">
      <GovBar dark />
      <div className="grid flex-1 lg:grid-cols-[1.1fr_1fr]">
        {/* Left: civic hero */}
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-civic-900 via-civic-800 to-civic-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-3">
            <Logo size={52} />
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Lungsod ng Dasmariñas · Cavite</div>
              <div className="text-xl font-bold">Sangguniang Panlungsod</div>
            </div>
          </div>
          <HeritageArt className="pointer-events-none absolute -bottom-8 -right-24 w-[460px] text-accent/30" />
          <div className="relative max-w-md">
            <h2 className="text-4xl font-bold leading-tight">
              Committee <span className="text-accent">Reporting</span> &amp; Transmittal Platform
            </h2>
            <ul className="mt-6 space-y-2 text-sm text-white/85">
              {FEATURES.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-accent">◆</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-white/60">For the official use of the committees of the Sangguniang Panlungsod ng Dasmariñas.</p>
        </section>

        {/* Right: form */}
        <section className="flex items-center justify-center bg-surface p-4 sm:p-8">
          <div className="w-full max-w-md">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <Logo size={44} />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted">Lungsod ng Dasmariñas</div>
                <div className="font-bold">Sangguniang Panlungsod</div>
              </div>
            </div>
            <div className="card p-7 shadow-lg">
              <h1 className="text-xl font-bold">{title}</h1>
              <p className="mb-5 mt-1 text-sm text-muted">{subtitle}</p>
              {children}
            </div>
            <div className="mt-4 h-1 rounded-full bg-gradient-to-r from-civic-700 via-accent to-civic-700 opacity-80" aria-hidden />
          </div>
        </section>
      </div>
    </div>
  );
}
