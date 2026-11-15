import { describe, expect, it } from 'vitest';
import { canonical, formatDateRange, formatName, formatPhone, parseDateRange } from './format';

describe('formatting of encoded / pasted values', () => {
  it('phone numbers', () => {
    expect(formatPhone('+63 917 123 4567')).toBe('09171234567');
    expect(formatPhone('9388293438')).toBe('09388293438');
    expect(formatPhone('0917-123-4567')).toBe('09171234567');
    expect(formatPhone('(046) 416-1234')).toBe('0464161234');
  });
  it('barangay spelling from the official list', () => {
    const list = ['Salitran II', 'Saint Peter I', 'Burol Main'];
    expect(canonical('brgy. salitran 2', list)).toBe('Salitran II');
    expect(canonical('St. Peter I', list)).toBe('Saint Peter I');
    expect(canonical('Unknown Place', list)).toBe('Unknown Place');
  });
  it('names', () => {
    expect(formatName('  JUAN   DELA CRUZ ')).toBe('Juan Dela Cruz');
    expect(formatName('Ma. Clara D. Santos')).toBe('Ma. Clara D. Santos');
  });
  it('date of event ranges', () => {
    expect(formatDateRange('2026-12-20')).toBe('December 20, 2026');
    expect(formatDateRange('2026-12-20', '2026-12-21')).toBe('December 20–21, 2026');
    expect(formatDateRange('2026-11-30', '2026-12-02')).toBe('Nov 30 – Dec 2, 2026');
    expect(parseDateRange('December 20–21, 2026')).toEqual({ from: '2026-12-20', to: '2026-12-21' });
    expect(parseDateRange('Nov 30 – Dec 2, 2026')).toEqual({ from: '2026-11-30', to: '2026-12-02' });
  });
});
