// Builds the report header (code, date, covering) the same way the sample transmittals look.
import type { Committee, Entry, TransmittalType } from '@/lib/types';
import { TYPES } from '@/features/transmittal/config';
import { coveringText, fmtHeaderDate, weekNumber } from '@/lib/dates';

export interface ReportHeader {
  code: string; // SPMRC-NGO-045
  dateText: string; // 5 NOV 2026
  covering: string; // (44th | Oct 22 to Nov 5)
  office: string; // OFFICE OF SPM ROBIN CANTIMBUHAN
  title: string; // TRANSMITTAL OF SOLICITATION REQUESTS – NGO
  subtitle?: string; // optional line under the title, e.g. (44th | Nov 03 - 05, 2026)
  week: number;
}

export function transmittalCode(prefix: string, type: TransmittalType, week: number): string {
  const w = String(week).padStart(3, '0');
  return `${prefix || 'SPM'}-${TYPES[type].code}-${w}`;
}

export function officeLine(committee: Committee | null): string {
  if (!committee) return '';
  if (committee.spm_name) return `OFFICE OF SPM ${committee.spm_name}`.toUpperCase();
  return committee.name.toUpperCase();
}

/** Default header for a set of entries transmitted on `transmitDate`. */
export function buildHeader(
  type: TransmittalType,
  committee: Committee | null,
  entries: Pick<Entry, 'date_received'>[],
  transmitDate: string,
): ReportHeader {
  const week = weekNumber(transmitDate);
  const dates = entries.map((e) => e.date_received).sort();
  const start = dates[0] ?? transmitDate;
  const end = transmitDate > (dates[dates.length - 1] ?? '') ? transmitDate : dates[dates.length - 1];
  return {
    code: transmittalCode(committee?.code_prefix ?? 'SPM', type, week),
    dateText: fmtHeaderDate(transmitDate),
    covering: coveringText(week, start, end),
    office: officeLine(committee),
    title: TYPES[type].title,
    week,
  };
}
