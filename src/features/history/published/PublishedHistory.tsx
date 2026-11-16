'use client';
// Published (All): every office's transmitted records. Tabs: All records | Weekly published.
import { useState } from 'react';
import { PageHeader, Tabs } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { AllRecords } from './AllRecords';
import { WeeklyLists } from './WeeklyLists';

type Tab = 'all' | 'weekly';

export function PublishedHistory() {
  const { committee, committeeName, isAdmin } = useSession();
  const [tab, setTab] = useState<Tab>('all');
  const canPublish = isAdmin || !!committee?.can_edit_published;
  return (
    <>
      <PageHeader title="Published (All)" subtitle="Records transmitted by every office." />
      <Tabs<Tab> value={tab} onChange={setTab} items={[['all', 'All records'], ['weekly', 'Weekly published']]} />
      {tab === 'all' ? <AllRecords canPublish={canPublish} onPublished={() => setTab('weekly')} /> : <WeeklyLists committeeName={committeeName} canPublish={canPublish} />}
    </>
  );
}
