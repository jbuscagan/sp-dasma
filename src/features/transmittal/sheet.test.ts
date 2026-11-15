import { describe, expect, it } from 'vitest';
import { parseDateText } from '@/lib/dates';
import { parseTable } from '@/features/admin/ImportDialog';

describe('spreadsheet entry helpers', () => {
  it('reads dates typed or pasted in common formats', () => {
    expect(parseDateText('11/04/2026')).toBe('2026-11-04');
    expect(parseDateText('2026-11-04')).toBe('2026-11-04');
    expect(parseDateText('Nov 4, 2026')).toBe('2026-11-04');
    expect(parseDateText('4 November 2026')).toBe('2026-11-04');
    expect(parseDateText('11/4/26')).toBe('2026-11-04');
    expect(parseDateText('next week')).toBeNull();
  });
  it('splits pasted / CSV lists', () => {
    expect(parseTable('Name\tBarangay\nPWD\tFatima III')).toEqual([['Name', 'Barangay'], ['PWD', 'Fatima III']]);
    expect(parseTable('"DIHS Alumni Association, Inc.",Zone II')).toEqual([['DIHS Alumni Association, Inc.', 'Zone II']]);
  });
});
