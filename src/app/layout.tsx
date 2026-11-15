import type { Metadata } from 'next';
import './globals.css';
import { THEME_BOOT } from '@/features/shell/theme';

export const metadata: Metadata = {
  title: { default: 'SP Dasmariñas Committee Platform', template: '%s · SP Dasmariñas' },
  description: 'Transmittals, reports and DTR for the committees of the Sangguniang Panlungsod ng Dasmariñas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
