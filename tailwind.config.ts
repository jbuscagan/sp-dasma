import type { Config } from 'tailwindcss';

// Brand tokens live in src/app/globals.css (CSS variables) so light/dark share one palette.
// Theme: Dasmariñas green + Paru-Paro (butterfly) festival gold.
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        gold: 'rgb(var(--gold) / <alpha-value>)',
        // Dasmariñas green (sidebar, banners) and butterfly gold (Paru-Paro Festival) — same in light and dark mode
        civic: { 950: '#05261a', 900: '#0a3a26', 800: '#0e4f33', 700: '#146b43', 600: '#1b8a55' },
        accent: '#f5c33b',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
      },
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
