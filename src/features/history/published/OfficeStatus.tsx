'use client';
// Published (All) › Office status: for one week, which offices submitted on which day and which
// offices already transmitted (= done for the week). For the offices that manage publishing.
import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Empty } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/features/auth/session';
import { listTransmittals } from '@/features/transmittal/api';
import { TYPES } from '@/features/transmittal/config';
import { must, useLive } from '@/hooks/useLive';
import { supabase } from '@/lib/supabase/client';
import { fmtLong, isoToUtc, ordinal, todayIso, utcToIso, weekNumber, weekStart } from '@/lib/dates';
import type { Submission } from '@/lib/types';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const addDays = (iso: string, n: number) => {
  const d = isoToUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return utcToIso(d);
};

export function OfficeStatus() {
  const { committees } = useSession();
  const [day, setDay] = useState(todayIso());
  const start = weekStart(day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const end = days[6];
  const week = weekNumber(day);

  const subs = useLive(
    async () => must(await supabase().from('submissions').select('*').gte('submit_date', start).lte('submit_date', end)) as Submission[],
    ['submissions'],
    [start],
  );
  const tx = useLive(() => listTransmittals(), ['transmittals']);

  const rows = useMemo(() => {
    const weekTx = (tx.data ?? []).filter((t) => t.week_no === week && t.transmitted_on.slice(0, 4) === end.slice(0, 4));
    return committees
      .map((c) => {
        const mine = (subs.data ?? []).filter((s) => s.committee_id === c.id);
        const perDay = days.map((d) => mine.filter((s) => s.submit_date === d).reduce((a, s) => a + (s.entry_count ?? 0), 0));
        const sent = weekTx.filter((t) => t.committee_id === c.id);
        return { c, perDay, sent };
      })
      .sort((a, b) => Number(b.sent.length > 0) - Number(a.sent.length > 0) || a.c.name.localeCompare(b.c.name));
  }, [committees, subs.data, tx.data, week, end]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = rows.filter((r) => r.sent.length).length;

  return (
    <div className="space-y-3">
      {(subs.error || tx.error) && <Alert kind="error">{subs.error || tx.error}</Alert>}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <Button size="sm" variant="secondary" onClick={() => setDay(addDays(start, -7))} aria-label="Previous week">‹</Button>
        <input type="date" className="input w-auto" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Any day of the week" />
        <Button size="sm" variant="secondary" onClick={() => setDay(addDays(start, 7))} aria-label="Next week">›</Button>
        <span className="text-sm font-semibold">{ordinal(week)} week · {fmtLong(start)} – {fmtLong(end)}</span>
        <Badge color={done === rows.length && rows.length ? 'green' : 'amber'} >{done} of {rows.length} office(s) transmitted</Badge>
      </div>
      <div className="card">
        {!rows.length ? (
          <Empty>No offices yet.</Empty>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-brand-50 text-[11px] font-semibold uppercase text-brand-700">
                <th className="px-2 py-2">Office</th>
                {days.map((d, i) => <th key={d} className="border-l border-line px-1 py-2">{DAY[i]}<span className="block font-normal normal-case text-muted">{d.slice(8)}</span></th>)}
                <th className="border-l border-line px-2 py-2">Transmitted this week</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, perDay, sent }) => (
                <tr key={c.id} className="border-b border-line">
                  <td className="px-2 py-2 font-medium">{c.name}</td>
                  {perDay.map((n, i) => (
                    <td key={i} className="border-l border-line px-1 py-2 text-center" title={n ? `${n} request(s) submitted` : 'Nothing submitted'}>
                      {n ? <span className="inline-flex items-center gap-0.5 font-semibold text-blue-700"><Icon name="check" size={13} />{n}</span> : <span className="text-muted">·</span>}
                    </td>
                  ))}
                  <td className="border-l border-line px-2 py-2">
                    {sent.length ? (
                      <div className="flex flex-wrap gap-1">
                        {sent.map((t) => <Badge key={t.id} color="green"><Icon name="lock" size={11} />{TYPES[t.type].label} · {t.code}</Badge>)}
                      </div>
                    ) : (
                      <span className="text-xs text-muted">Not yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-muted">✓ = number of requests the office submitted that day (still editable). A green lock = the office transmitted that category for the week (done, locked).</p>
    </div>
  );
}
