import { describe, expect, it } from 'vitest';
import type { Entry } from '@/lib/types';
import { findIssues } from './discrepancies';

const e = (id: string, office: string, name: string, phone: string) =>
  ({ id, committee_id: office, solicitor_name: name, patient_name: null, contact_number: phone }) as unknown as Entry;

describe('Checks (possible discrepancies)', () => {
  it('same number written differently, different names', () => {
    const issues = findIssues([e('1', 'A', 'Glenda Sescar', '9388293438'), e('2', 'B', 'Glenda Cruz', '09388293438')]);
    expect(issues.get('1')?.map((i) => i.kind)).toContain('contact-mismatch');
    expect(issues.get('1')?.[0].related).toEqual(['2']);
  });
  it('same person in two offices, even with different capitalisation and initials', () => {
    const issues = findIssues([e('1', 'A', 'Ma. Clara D. Santos', ''), e('2', 'B', 'MA CLARA SANTOS', '')]);
    expect(issues.get('2')?.map((i) => i.kind)).toEqual(['repeat-solicitor']);
  });
  it('no false alarm for the same person in the same office with the same number', () => {
    expect(findIssues([e('1', 'A', 'Juan Dela Cruz', '09171234567'), e('2', 'A', 'JUAN DELA CRUZ', '+63 917 123 4567')]).size).toBe(0);
  });
});
