// Sidebar menu. Add a module = add a line here + a page under src/app/(app)/.
import { TYPE_ORDER, TYPES } from '@/features/transmittal/config';

export interface NavItem { href: string; label: string; icon: string; adminOnly?: boolean } // icon = name in components/ui/Icon.tsx
export interface NavGroup { title: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { title: '', items: [{ href: '/', label: 'Dashboard', icon: 'dashboard' }] },
  // Each transmittal type has its own icon, named after the type (e.g. "medical" = cross).
  { title: 'Transmittal', items: TYPE_ORDER.map((t) => ({ href: `/transmittal/${t}`, label: TYPES[t].label, icon: t })) },
  {
    title: 'History',
    items: [
      { href: '/history/own', label: 'Transmitted (own)', icon: 'send' },
      { href: '/history/published', label: 'Published (all)', icon: 'globe' },
      { href: '/history/archived', label: 'Archived', icon: 'archive' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { href: '/dtr', label: 'DTR', icon: 'clock' },
      { href: '/budget', label: 'Budget report', icon: 'peso' },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/settings', label: 'Settings', icon: 'settings' },
      { href: '/admin', label: 'Admin', icon: 'shield', adminOnly: true },
    ],
  },
];
