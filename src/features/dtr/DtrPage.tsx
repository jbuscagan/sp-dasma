'use client';
import { useState } from 'react';
import { Alert, PageHeader, Tabs } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useLive } from '@/hooks/useLive';
import { getConfig, listEmployees } from './api';
import { AttendanceTable } from './AttendanceTable';
import { DtrSettingsForm } from './DtrSettingsForm';
import { Employees } from './Employees';
import { Planner } from './Planner';

type Tab = 'planner' | 'attendance' | 'employees' | 'settings';

export function DtrPage() {
  const { committee } = useSession();
  const [tab, setTab] = useState<Tab>('planner');
  const id = committee?.id ?? '';
  const emp = useLive(() => (id ? listEmployees(id) : Promise.resolve([])), ['employees'], [id]);
  const cfg = useLive(() => getConfig(id), ['dtr_config'], [id]);

  if (!committee) return <Alert kind="warn">Your account is not linked to an office, so there is no DTR to show.</Alert>;

  return (
    <>
      <PageHeader title="Daily Time Record" subtitle={`Employees and DTRs of ${committee.name}. Records are saved under your office automatically.`} />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          ['planner', 'Planner'],
          ['attendance', 'Records'],
          ['employees', `Employees (${emp.data?.length ?? 0})`],
          ['settings', 'Rules & settings'],
        ]}
      />
      {(emp.error || cfg.error) && <div className="mb-3"><Alert kind="error">{emp.error || cfg.error}</Alert></div>}
      {!cfg.data || !emp.data ? (
        <div className="p-8 text-center text-sm text-muted">Loading…</div>
      ) : (
        <>
          {tab === 'planner' && <Planner key={JSON.stringify(cfg.data.rules)} committeeId={id} employees={emp.data} rules={cfg.data.rules} settings={cfg.data.settings} />}
          {tab === 'attendance' && <AttendanceTable committeeId={id} employees={emp.data} />}
          {tab === 'employees' && <Employees committeeId={id} employees={emp.data} />}
          {tab === 'settings' && <DtrSettingsForm committeeId={id} rules={cfg.data.rules} settings={cfg.data.settings} />}
        </>
      )}
    </>
  );
}
