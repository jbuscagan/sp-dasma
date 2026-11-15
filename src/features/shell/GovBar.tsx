'use client';
// Slim top bar in the style of Philippine government websites, with Philippine Standard Time.
import { useEffect, useState } from 'react';

function usePst() {
  const [now, setNow] = useState<string>('');
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
    const tick = () => setNow(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function GovBar({ dark }: { dark?: boolean }) {
  const pst = usePst();
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-1.5 text-[11px] tracking-wide ${dark ? 'bg-black/30 text-white/80' : 'bg-civic-950 text-white/85'}`}>
      <span className="truncate">
        <span className="font-semibold text-accent">Republic of the Philippines</span>
        <span className="hidden sm:inline"> · Province of Cavite · City of Dasmariñas</span>
      </span>
      <span className="whitespace-nowrap tabular-nums" title="Philippine Standard Time">
        <span className="hidden md:inline">Philippine Standard Time: </span>
        {pst}
      </span>
    </div>
  );
}
