'use client';
// Confirm and publish the weekly combined list (all offices).
import { useMemo, useState } from 'react';
import { Alert, Button, Field, Modal } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { coveringText, weekNumber, weekStart } from '@/lib/dates';
import type { Entry } from '@/lib/types';
import { publishWeek } from '@/features/transmittal/api';
import { addDays } from './shared';

type Basis = 'received' | 'transmitted';

/**
 * Only records whose date falls inside "Week from – Week to" go into the list
 * (by date received, or by the date their office transmitted them).
 */
export function PublishDialog({
  rows,
  selectedCount,
  transmittedOn,
  onClose,
  onDone,
}: {
  rows: Entry[];
  selectedCount: number;
  transmittedOn: (e: Entry) => string | null; // yyyy-mm-dd
  onClose: () => void;
  onDone: () => void;
}) {
  const start = weekStart();
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(addDays(start, 6));
  const [basis, setBasis] = useState<Basis>('received');
  const week = weekNumber(to || from);
  const dateOf = (e: Entry) => (basis === 'received' ? e.date_received : transmittedOn(e)) ?? '';
  const inWeek = useMemo(() => rows.filter((e) => {
    const d = dateOf(e).slice(0, 10);
    return !!d && d >= from && d <= to;
  }), [rows, from, to, basis]); // eslint-disable-line react-hooks/exhaustive-deps
  const outside = rows.length - inWeek.length;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      await publishWeek({ title: `Week ${week}`, covering: coveringText(week, from, to), week, from, to, entryIds: inWeek.map((e) => e.id) });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Publish the weekly list"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button busy={busy} disabled={!from || !to || from > to || !inWeek.length} onClick={go}><Icon name="globe" size={16} />Publish {inWeek.length}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert kind="error">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Week from"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Week to"><input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <Field label="Which date decides the week">
          <select className="input" value={basis} onChange={(e) => setBasis(e.target.value as Basis)}>
            <option value="received">Date received</option>
            <option value="transmitted">Date the office transmitted it</option>
          </select>
        </Field>
        <p className="text-sm">
          <b>{inWeek.length}</b> of the {selectedCount ? `${rows.length} selected` : `${rows.length} shown`} record(s) fall within these dates and will be published as one list for all offices.
          {outside > 0 && <> <span className="text-muted">{outside} record(s) from other weeks are left out.</span></>}
        </p>
        <p className="text-xs text-muted">Will be saved as <b>Week {week}</b> {from && to ? coveringText(week, from, to) : ''}.</p>
      </div>
    </Modal>
  );
}

