import type { Entry } from '@/lib/types';
import { fmtMDY } from '@/lib/dates';
import { displayName, orgBarangay, requestText, TYPES, type ColumnDef } from '@/features/transmittal/config';

/** Columns for pages that mix all transmittal types (Published, Report filter). */
export function combinedColumns(committeeName: (id: string) => string, withOffice = true): ColumnDef[] {
  const cols: ColumnDef[] = [
    { label: 'DATE RECEIVED', width: 10, value: (e: Entry) => fmtMDY(e.date_received) },
    { label: 'TYPE', width: 9, value: (e: Entry) => TYPES[e.type].label },
    { label: 'NAME', width: 17, value: displayName },
    { label: 'ORGANIZATION / BARANGAY', width: 17, value: orgBarangay },
    {
      label: 'PURPOSE / REQUEST',
      width: 18,
      value: (e: Entry) => [e.diagnosis, e.purpose, requestText(e), e.assistance_spec].filter(Boolean).join(' · '),
    },
    { label: 'CONTACT NO.', width: 11, value: (e: Entry) => e.contact_number ?? '' },
    { label: 'DATE OF EVENT', width: 10, value: (e: Entry) => e.event_date ?? '' },
  ];
  if (withOffice) cols.splice(1, 0, { label: 'OFFICE', width: 14, value: (e: Entry) => committeeName(e.committee_id) });
  return cols;
}
