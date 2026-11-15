'use client';
// Administrator tools: one tab per file in this folder.
import { useEffect, useState } from 'react';
import { Alert, PageHeader, Tabs } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { AccountsTab } from './AccountsTab';
import { ActivityLogTab } from './ActivityLogTab';
import { DirectoryTab } from './DirectoryTab';
import { OfficesTab } from './OfficesTab';
import { RevisionsTab } from './RevisionsTab';

type Tab = 'users' | 'revisions' | 'offices' | 'directory' | 'activity';

export function AdminPage() {
  const { isAdmin } = useSession();
  const [tab, setTab] = useState<Tab>('users');
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'revisions' || t === 'activity') setTab(t);
  }, []);
  if (!isAdmin) return <Alert kind="error">Administrators only.</Alert>;
  return (
    <>
      <PageHeader title="Administration" subtitle="Approve accounts, manage offices and the directory." />
      <Tabs<Tab> value={tab} onChange={setTab} items={[['users', 'Accounts'], ['revisions', 'Revision requests'], ['offices', 'Offices & permissions'], ['directory', 'Barangays & organizations'], ['activity', 'Activity log']]} />
      {tab === 'users' && <AccountsTab />}
      {tab === 'revisions' && <RevisionsTab />}
      {tab === 'offices' && <OfficesTab />}
      {tab === 'directory' && <DirectoryTab />}
      {tab === 'activity' && <ActivityLogTab />}
    </>
  );
}
