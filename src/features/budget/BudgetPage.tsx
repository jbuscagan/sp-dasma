'use client';
import { useState } from 'react';
import { Alert, PageHeader, Tabs } from '@/components/ui';
import { useBudgetAccess } from './useBudgetAccess';
import { ContributionTab } from './ContributionTab';
import { MonitoringTab } from './MonitoringTab';
import { BarangayBudgetTab } from './BarangayBudgetTab';

type Tab = 'contribution' | 'monitoring' | 'barangay';

export function BudgetPage() {
  const { canEdit } = useBudgetAccess();
  const [tab, setTab] = useState<Tab>('contribution');
  return (
    <>
      <PageHeader title="Budget report" subtitle="SP contribution, weekly solicitation monitoring, and the annual budget of barangays and SK." />
      {!canEdit && (
        <div className="mb-4">
          <Alert kind="info">You can view and print budget reports. Ask an administrator for “Budget encoder” access to make changes.</Alert>
        </div>
      )}
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          ['contribution', 'SP Contribution'],
          ['monitoring', 'Solicitation monitoring'],
          ['barangay', 'Barangay & SK annual budget'],
        ]}
      />
      {tab === 'contribution' && <ContributionTab canEdit={canEdit} />}
      {tab === 'monitoring' && <MonitoringTab canEdit={canEdit} />}
      {tab === 'barangay' && <BarangayBudgetTab canEdit={canEdit} />}
    </>
  );
}
