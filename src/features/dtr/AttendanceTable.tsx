'use client';
// Records: review and correct the times of a month's cut-off before printing.
import { useState } from 'react';
import { Alert, Button, Empty, Field } from '@/components/ui';
import { useLive } from '@/hooks/useLive';
import { fmtLong, todayIso, weekdayOf } from '@/lib/dates';
import { DAY_NAMES, currentCutoff, cutoffRange, TYPE_LABELS, type DayType } from './engine';
import { CutoffPicker } from './CutoffPicker';
import { deleteAttendance, listAttendance, updateAttendance, type Employee } from './api';

const TIME_FIELDS = [
  ['am_in', 'AM In'],
  ['am_out', 'AM Out'],
  ['pm_in', 'PM In'],
  ['pm_out', 'PM Out'],
] as const;

export function AttendanceTable({ committeeId, employees }: { committeeId: string; employees: Employee[] }) {
  const [[start, end], setRange] = useState<[string, string]>(() => {
    const c = currentCutoff(todayIso());
    return cutoffRange(c.month, c.cutoff);
  });
  const [who, setWho] = useState('');
  const { data, error, loading } = useLive(
    () => listAttendance(committeeId, start, end, who ? [who] : undefined),
    ['attendance'],
    [committeeId, start, end, who],
  );
  const name = (id: string) => employees.find((e) => e.id === id)?.name ?? '—';
  const rows = (data ?? []).slice().sort((a, b) => name(a.employee_id).localeCompare(name(b.employee_id)) || a.work_date.localeCompare(b.work_date));

  return (
    <div className="card">
      <div className="flex flex-wrap items-end gap-3 border-b border-line p-3">
        <CutoffPicker onChange={setRange} />
        <Field label="Person">
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Everyone</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <span className="pb-2 text-sm text-muted">{fmtLong(start)} – {fmtLong(end)} · {rows.length} record(s) · changes save automatically</span>
      </div>
      {error && <div className="p-3"><Alert kind="error">{error}</Alert></div>}
      {loading ? (
        <div className="p-8 text-center text-sm text-muted">Loading…</div>
      ) : !rows.length ? (
        <Empty>No records for this cut-off yet. Use the Planner to create them.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Employee</th><th>Date</th><th>Day</th>
                {TIME_FIELDS.map(([, l]) => <th key={l}>{l}</th>)}
                <th>Type</th><th>Note</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap font-medium">{name(r.employee_id)}</td>
                  <td className="whitespace-nowrap">{fmtLong(r.work_date)}</td>
                  <td>{DAY_NAMES[weekdayOf(r.work_date)].slice(0, 3)}</td>
                  {TIME_FIELDS.map(([k]) => (
                    <td key={k}>
                      <input
                        type="time"
                        className="input w-[7.5rem] py-1"
                        defaultValue={r[k] ?? ''}
                        onBlur={(e) => e.target.value !== (r[k] ?? '') && updateAttendance(r.id, { [k]: e.target.value })}
                      />
                    </td>
                  ))}
                  <td className="whitespace-nowrap text-xs">{TYPE_LABELS[r.day_type as DayType] ?? r.day_type}</td>
                  <td className="text-xs">{r.note}</td>
                  <td>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteAttendance(r.id)}>✕</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
