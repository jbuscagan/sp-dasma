import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES, DEFAULT_SETTINGS, generateAttendance, minToPrint, parseRange, parseTime, planForms,
  preset21to5, preset6to20, presetAuto, parseTime as pt, slotIndexes, cutoffRange,
} from './engine';
import { coveringText, weekNumber } from '@/lib/dates';
import { transmittalCode } from '@/features/reports/header';

describe('time parsing', () => {
  it('parses 24h and am/pm', () => {
    expect(parseTime('7:30')).toBe(450);
    expect(parseTime('6:35 PM')).toBe(18 * 60 + 35);
    expect(parseTime('12:05am')).toBe(5);
    expect(parseTime('25:00')).toBeNull();
    expect(parseRange('7:30-7:55', true)).toEqual([450, 475]);
    expect(parseRange('45 - 30', false)).toEqual([30, 45]);
    expect(minToPrint(18 * 60 + 35)).toBe('6:35');
  });
});

describe('attendance generation', () => {
  const names = { a: 'Emerson Virata', b: 'Elvina Bequillo' };
  it('fills workdays, respects holidays and half days', () => {
    const res = generateAttendance(
      {
        start: '2026-11-01',
        end: '2026-11-15',
        employeeIds: ['a', 'b'],
        workdays: [1, 2, 3, 4],
        overrides: [
          { from: '2026-11-02', who: 'ALL', type: 'HOLIDAY' },
          { from: '2026-11-03', who: ['b'], type: 'HALF_AM' },
          { from: '2026-11-07', who: ['a'], type: 'WORK' }, // a Saturday
          { from: '2026-11-09', who: 'ALL', type: 'CUSTOM', amIn: '08:00', amOut: '12:00', pmIn: '13:00', pmOut: '17:00' },
        ],
      },
      DEFAULT_RULES,
      DEFAULT_SETTINGS,
      names,
      () => 0.5,
    );
    const a = res.rows.filter((r) => r.employee_id === 'a').map((r) => r.work_date);
    expect(a).not.toContain('2026-11-02');
    expect(a).toContain('2026-11-07');
    expect(a).not.toContain('2026-11-06'); // Friday is off by default
    const halfDay = res.rows.find((r) => r.employee_id === 'b' && r.work_date === '2026-11-03')!;
    expect(halfDay.pm_in).toBe('');
    expect(halfDay.am_out).not.toBe('');
    const custom = res.rows.find((r) => r.employee_id === 'a' && r.work_date === '2026-11-09')!;
    expect([custom.am_in, custom.pm_out]).toEqual(['08:00', '17:00']);
    for (const r of res.rows) {
      const t = [r.am_in, r.am_out, r.pm_in, r.pm_out].filter(Boolean).map((x) => pt(x)!);
      for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
    }
    expect(res.warnings).toEqual([]);
  });

  it('splits forms into 1-15 and 16-31', () => {
    const t = { amIn: 450, amOut: 700, pmIn: 740, pmOut: 1110 };
    const forms = planForms({ '2026-10-21': t, '2026-11-02': t, '2026-11-05': t });
    // A (1-15) first, then B (16-31), so an office prints 1-15, 16-31, 1-15 | 16-31, …
    expect(forms.map((f) => f.key)).toEqual(['2026-11-A', '2026-10-B']);
    expect(Object.keys(forms[0].days)).toEqual(['2', '5']);
  });

  it('slots alternate A/B and leave a blank form when needed', () => {
    expect(slotIndexes(['A', 'B', 'A', 'B', 'A', 'B'])).toEqual([0, 1, 2, 3, 4, 5]);
    // second person only has a 16-31 form -> slot 2 (an A slot) stays blank
    expect(slotIndexes(['A', 'B', 'B', 'A'])).toEqual([0, 1, 3, 4]);
  });

  it('cut-offs: 1st = 1–15, 2nd = 16–end of month', () => {
    expect(cutoffRange('2026-11', 'first')).toEqual(['2026-11-01', '2026-11-15']);
    expect(cutoffRange('2026-11', 'second')).toEqual(['2026-11-16', '2026-11-30']);
    expect(cutoffRange('2028-02', 'second')).toEqual(['2028-02-16', '2028-02-29']);
    expect(cutoffRange('2026-12', 'month')).toEqual(['2026-12-01', '2026-12-31']);
  });

  it('date presets', () => {
    expect(preset21to5('2026-11-14')).toEqual(['2026-10-21', '2026-11-05']);
    expect(preset6to20('2026-11-14')).toEqual(['2026-11-06', '2026-11-20']);
    expect(presetAuto('2026-11-20')).toEqual(['2026-11-06', '2026-11-20']);
    expect(preset21to5('2026-01-03')).toEqual(['2025-12-21', '2026-01-05']);
  });
});

describe('transmittal header', () => {
  it('matches the week numbers on the sample reports', () => {
    expect(weekNumber('2026-10-15')).toBe(41);
    expect(weekNumber('2026-10-29')).toBe(43);
    expect(weekNumber('2026-11-05')).toBe(44);
    expect(transmittalCode('SPMRC', 'ngo', 45)).toBe('SPMRC-NGO-045');
    expect(transmittalCode('SPMRC', 'medical', 41)).toBe('SPMRC-MA-041');
    expect(coveringText(44, '2026-10-22', '2026-11-05')).toBe('(44th | Oct 22 to Nov 5)');
    expect(coveringText(41, '2026-10-12', '2026-10-15')).toBe('(41st | Oct 12 to 15)');
  });
});
