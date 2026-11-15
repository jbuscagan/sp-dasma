import { notFound } from 'next/navigation';
import { isTransmittalType } from '@/features/transmittal/config';
import { TransmittalPage } from '@/features/transmittal/TransmittalPage';

export default async function Page({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!isTransmittalType(type)) notFound();
  return <TransmittalPage key={type} type={type} />;
}
