// Data checks across offices (shown in the "Checks" column of Published (All)):
//  • the same contact number used with different names,
//  • the same person asking several offices.
import type { Entry } from '@/lib/types';
import { norm } from '@/features/scan/extract';

/** Last 10 digits, so 9388293438, 09388293438 and +63 938 829 3438 are the same number. */
const phoneKey = (s: string | null | undefined) => {
  const d = (s ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};

/** "Ma. Clara D. Santos" and "MA CLARA SANTOS" → same key (initials and dots ignored). */
const nameKey = (s: string | null | undefined) =>
  norm(s ?? '')
    .split(' ')
    .filter((w) => w.length > 1 && !['jr', 'sr', 'ii', 'iii', 'iv'].includes(w))
    .join(' ');

export interface Issue {
  kind: 'contact-mismatch' | 'repeat-solicitor';
  text: string;
  related: string[]; // ids of the other records involved
}

const personOf = (e: Entry) => e.patient_name || e.solicitor_name;

export function findIssues(entries: Entry[]): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>();
  const push = (id: string, i: Issue) => out.set(id, [...(out.get(id) ?? []), i]);

  const byPhone = new Map<string, Entry[]>();
  const byName = new Map<string, Entry[]>();
  for (const e of entries) {
    const p = phoneKey(e.contact_number);
    if (p) byPhone.set(p, [...(byPhone.get(p) ?? []), e]);
    const n = nameKey(personOf(e));
    if (n.length > 4) byName.set(n, [...(byName.get(n) ?? []), e]);
  }

  byPhone.forEach((list) => {
    const names = new Set(list.map((e) => nameKey(personOf(e))));
    if (names.size > 1) {
      list.forEach((e) =>
        push(e.id, {
          kind: 'contact-mismatch',
          text: `The number ${e.contact_number} is used by ${names.size} different names`,
          related: list.filter((x) => x.id !== e.id).map((x) => x.id),
        }),
      );
    }
  });

  byName.forEach((list) => {
    const offices = new Set(list.map((e) => e.committee_id));
    if (offices.size > 1) {
      list.forEach((e) =>
        push(e.id, {
          kind: 'repeat-solicitor',
          text: `${personOf(e)} also asked ${offices.size - 1} other office(s)`,
          related: list.filter((x) => x.id !== e.id).map((x) => x.id),
        }),
      );
    }
  });

  return out;
}
