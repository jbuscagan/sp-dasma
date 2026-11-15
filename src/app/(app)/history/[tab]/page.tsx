import { notFound } from 'next/navigation';
import { OwnHistory } from '@/features/history/OwnHistory';
import { PublishedHistory } from '@/features/history/PublishedHistory';
import { ArchivedHistory } from '@/features/history/ArchivedHistory';

const PAGES = { own: OwnHistory, published: PublishedHistory, archived: ArchivedHistory };

export default async function Page({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const Comp = PAGES[tab as keyof typeof PAGES];
  if (!Comp) notFound();
  return <Comp />;
}
