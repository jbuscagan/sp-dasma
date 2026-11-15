'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { useStackTables } from './StackTables';
import { NAV } from './nav';
import { Logo } from './Logo';
import { GovBar } from './GovBar';
import { Icon } from '@/components/ui/Icon';
import { signOut, useSession } from '@/features/auth/session';

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { profile, committee, isAdmin } = useSession();
  const [open, setOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  useStackTables(main);

  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-4">
        <Logo />
        <div className="leading-tight">
          <div className="text-sm font-bold text-white">Sangguniang Panlungsod</div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-accent">Lungsod ng Dasmariñas</div>
        </div>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((g) => (
          <div key={g.title || 'home'} className="mb-3">
            {g.title && <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-white/45">{g.title}</div>}
            {g.items
              .filter((i) => !i.adminOnly || isAdmin)
              .map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setOpen(false)}
                  className={`relative flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition ${
                    isActive(i.href)
                      ? 'bg-white/10 font-semibold text-white before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-accent'
                      : 'text-white/75 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon name={i.icon} size={17} className={isActive(i.href) ? 'text-accent' : 'opacity-75'} />
                  {i.label}
                </Link>
              ))}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-3">
        <button onClick={signOut} className="w-full rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10">
          Log out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-civic-900 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="absolute inset-y-0 left-0 w-72 bg-civic-900" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}
      <GovBar />
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-panel/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg border border-line p-1.5" aria-label="Open menu">
          <Icon name="menu" />
        </button>
        <Logo size={28} />
        <span className="truncate text-sm font-semibold">{committee?.name ?? 'SP Dasmariñas'}</span>
      </header>
      <main ref={main} className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 lg:py-8">{children}</main>
      <footer className="border-t border-line bg-panel px-4 py-5 text-xs text-muted sm:px-6">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2">
          <span>
            <b className="text-ink">Sangguniang Panlungsod ng Dasmariñas</b> · City Government of Dasmariñas, Cavite
          </span>
          <span>For official use of SP committees · Data handled under the Data Privacy Act of 2012 (RA 10173)</span>
        </div>
      </footer>
    </div>
  );
}
