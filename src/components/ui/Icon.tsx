// Small line icons (24×24, stroke = current text colour). Add a new one by adding its paths here.
const PATHS: Record<string, string[]> = {
  dashboard: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  ngo: ['M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6', 'M16 5a3 3 0 0 1 0 6', 'M21 20c0-2.6-1.6-4.8-4-5.6'],
  christmas: ['M3 8h18v4H3z', 'M12 8v13', 'M5 12v9h14v-9', 'M12 8H8.5a2.5 2.5 0 1 1 0-5C11 3 12 8 12 8z', 'M12 8h3.5a2.5 2.5 0 1 0 0-5C13 3 12 8 12 8z'],
  barangay: ['M3 11l9-7 9 7', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
  sk: ['M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z'],
  medical: ['M9 3h6v6h6v6h-6v6H9v-6H3V9h6z'],
  personal: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4z'],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M3 12h18', 'M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z'],
  archive: ['M3 4h18v4H3z', 'M5 8v12h14V8', 'M10 12h4'],
  filter: ['M3 5h18l-7 8v6l-4 2v-8z'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  peso: ['M8 21V4h5a4 4 0 0 1 0 8H8', 'M5 8h13', 'M5 11h13'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  pencil: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  trash: ['M4 7h16', 'M10 11v6M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 20h16'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  plus: ['M12 5v14M5 12h14'],
  check: ['M5 12l5 5L20 7'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  menu: ['M4 6h16M4 12h16M4 18h16'],
  logout: ['M15 4h4v16h-4', 'M10 8l-4 4 4 4', 'M6 12h11'],
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = '' }: { name: IconName | string; size?: number; className?: string }) {
  const paths = PATHS[name] ?? PATHS.dashboard;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
