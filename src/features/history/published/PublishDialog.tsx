'use client';
// Confirm and publish the weekly combined list (all offices).
import { useState } from 'react';
import { Alert, Button, Field, Modal } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { coveringText, weekNumber, weekStart } from '@/lib/dates';
import type { Entry } from '@/lib/types';
import { publishWeek } from '@/features/transmittal/api';
import { addDays } from './shared';

export function PublishDialog({ rows, selectedCount, onClose, onDone }: { rows: Entry[]; selectedCount: number; onClose: () => void; onDone: () => void }) {
  const start = weekStart();
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(addDays(start, 6));
  const week = weekNumber(to || from);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      await publishWeek({ title: `Week ${week}`, covering: coveringText(week, from, to), week, from, to, entryIds: rows.map((e) => e.id) });
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
          <Button busy={busy} disabled={!from || !to || from > to} onClick={go}><Icon name="globe" size={16} />Publish {rows.length}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert kind="error">{error}</Alert>}
        <p className="text-sm">
          You are about to publish {selectedCount ? <>the <b>{rows.length} selected</b></> : <>all <b>{rows.length}</b> shown</>} record(s) of all offices as one weekly list. It appears in
          <b> Weekly published</b> for everyone.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Week from"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Week to"><input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <p className="text-xs text-muted">Will be saved as <b>Week {week}</b> {from && to ? coveringText(week, from, to) : ''}.</p>
      </div>
    </Modal>
  );
}

