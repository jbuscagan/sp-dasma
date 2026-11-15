// Small helpers shared by the Published (All) tables.
import { isoToUtc, utcToIso } from '@/lib/dates';

/** Dates and phone numbers stay on one line. */
export const NOWRAP = /DATE RECEIVED|CONTACT/;

export const addDays = (iso: string, n: number) => {
  const d = isoToUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return utcToIso(d);
};
