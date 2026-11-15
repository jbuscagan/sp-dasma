// Flags scanned requests that look like ones already in the system (or twice in the same upload).
import type { Entry } from '@/lib/types';
import { norm } from './extract';

export interface DupInput {
  name: string;
  organization: string;
  contact: string;
  dateReceived: string;
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').replace(/^63/, '0');

/** Returns a short reason when the request probably exists already, otherwise null. */
export function findDuplicate(d: DupInput, existing: Entry[], committeeName: (id: string) => string): string | null {
  const e = findDuplicateEntry(d, existing);
  return e ? `Looks like ${e.patient_name || e.solicitor_name} (${e.date_received}, ${committeeName(e.committee_id)})` : null;
}

/** The existing request this one matches (same number + name or organization, or same name + organization). */
export function findDuplicateEntry(d: DupInput, existing: Entry[]): Entry | null {
  const phone = digits(d.contact);
  const name = norm(d.name).trim();
  const org = norm(d.organization).trim();
  for (const e of existing) {
    const sameName = !!name && (norm(e.solicitor_name ?? '').trim() === name || norm(e.patient_name ?? '').trim() === name);
    const samePhone = phone.length >= 10 && digits(e.contact_number) === phone;
    const sameOrg = !org || norm(e.organization ?? '').trim() === org;
    if ((samePhone && (sameName || sameOrg)) || (sameName && sameOrg && org)) return e;
  }
  return null;
}

/** Same request twice in one upload (same number, or same name + organization). */
export function batchDuplicates(list: DupInput[]): Map<number, number> {
  const out = new Map<number, number>();
  list.forEach((a, i) => {
    for (let j = 0; j < i; j++) {
      const b = list[j];
      const phone = digits(a.contact);
      if ((phone.length >= 10 && phone === digits(b.contact)) || (a.name && norm(a.name) === norm(b.name) && norm(a.organization) === norm(b.organization))) {
        out.set(i, j);
        break;
      }
    }
  });
  return out;
}
