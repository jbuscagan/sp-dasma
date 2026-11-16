'use client';
// Published (All): records submitted / transmitted by every office.
// Tabs: All records | Weekly published | Office status (for the offices that manage publishing).
import { useState } from 'react';
import { PageHeader, Tabs } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { AllRecords } from './AllRecords';
import { OfficeStatus } from './OfficeStatus';
import { WeeklyLists } from './WeeklyLists';

type Tab = 'all' | 'weekly' | 'status';

export function PublishedHistory() {
  const { committee, committeeName, isAdmin } = useSession();
  const [tab, setTab] = useState<Tab>('all');
  const canPublish = isAdmin || !!committee?.can_edit_published;
  const tabs: [Tab, string][] = [['all', 'All records'], ['weekly', 'Weekly published'], ...(canPublish ? ([['status', 'Office status']] as [Tab, string][]) : [])];
  return (
    <>
      <PageHeader title="Published (All)" subtitle="Requests submitted and transmitted by every office." />
      <Tabs<Tab> value={tab} onChange={setTab} items={tabs} />
      {tab === 'all' && <AllRecords canPublish={canPublish} onPublished={() => setTab('weekly')} />}
      {tab === 'weekly' && <WeeklyLists committeeName={committeeName} canPublish={canPublish} />}
      {tab === 'status' && canPublish && <OfficeStatus />}
    </>
  );
}
