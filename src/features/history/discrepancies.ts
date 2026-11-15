// Data checks across offices: the same contact number used with different names,
// or the same person asking several offices. Shown as badges on Published.
import type { Entry } from '@/lib/types';

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9ñ]/g, '');

export interface Issue {
  kind: 'contact-mismatch' | 'repeat-solicitor';
  text: string;
}

export function findIssues(entries: Entry[]): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>();
  const push = (id: string, i: Issue) => out.set(id, [...(out.get(id) ?? []), i]);

  const byContact = new Map<string, Entry[]>();
  const byName = new Map<string, Entry[]>();
  for (const e of entries) {
    const c = (e.contact_number ?? '').replace(/\D/g, '');
    if (c.length >= 10) byContact.set(c, [...(byContact.get(c) ?? []), e]);
    const n = norm(e.patient_name || e.solicitor_name);
    if (n.length > 4) byName.set(n, [...(byName.get(n) ?? []), e]);
  }

  byContact.forEach((list) => {
    const names = new Set(list.map((e) => norm(e.solicitor_name || e.patient_name)));
    if (names.size > 1) {
      list.forEach((e) =>
        push(e.id, {
          kind: 'contact-mismatch',
          text: `Same contact number used by ${names.size} different names`,
        }),
      );
    }
  });

  byName.forEach((list) => {
    const offices = new Set(list.map((e) => e.committee_id));
    if (offices.size > 1) {
      list.forEach((e) => push(e.id, { kind: 'repeat-solicitor', text: `Also requested from ${offices.size - 1} other office(s)` }));
    }
  });

  return out;
}
