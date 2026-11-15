// Decorative line art: Paru-Paro (butterfly) of Dasmariñas with soft sun rays. Not an official seal or logo.
function Butterfly({ x, y, s, r = 0 }: { x: number; y: number; s: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} strokeWidth={2.2 / s}>
      <path d="M-1 -2C-9 -17 -22 -17 -20 -6c1 7 9 8 19 6z" />
      <path d="M1 -2c8 -15 21 -15 19 -4 -1 7 -9 8 -19 6z" />
      <path d="M-1 1c-10 1 -16 8 -12 13 4 4 10 -3 12 -10z" />
      <path d="M1 1c10 1 16 8 12 13 -4 4 -10 -3 -12 -10z" />
      <path d="M0 -10v24M-.5 -9c-2 -5 -5 -7 -7 -7.5M.5 -9c2 -5 5 -7 7 -7.5" />
      <circle cx="-13" cy="-8" r="2.5" />
      <circle cx="13" cy="-8" r="2.5" />
    </g>
  );
}

export function HeritageArt({ className = '' }: { className?: string }) {
  const rays = Array.from({ length: 16 }, (_, i) => (i * 360) / 16);
  return (
    <svg viewBox="0 0 400 260" className={className} fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <g opacity="0.3" strokeWidth="1.2">
        {rays.map((a) => (
          <line key={a} x1="210" y1="130" x2={210 + Math.cos((a * Math.PI) / 180) * 200} y2={130 + Math.sin((a * Math.PI) / 180) * 200} />
        ))}
      </g>
      <Butterfly x={210} y={135} s={4.2} />
      <Butterfly x={70} y={60} s={1.4} r={-18} />
      <Butterfly x={345} y={215} s={1.1} r={22} />
      <path d="M95 70c30 10 50 25 70 45M330 200c-25 -10 -45 -20 -60 -35" strokeDasharray="2 6" opacity="0.6" />
    </svg>
  );
}
