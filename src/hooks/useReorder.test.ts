import { describe, expect, it } from 'vitest';
import { moveNextTo, moveToPosition } from './useReorder';

describe('row reordering', () => {
  const full = ['a', 'b', 'c', 'd', 'e'];
  it('drag before / after a row', () => {
    expect(moveNextTo(full, 'e', 'a', false)).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(moveNextTo(full, 'a', 'c', true)).toEqual(['b', 'c', 'a', 'd', 'e']);
  });
  it('type a position number', () => {
    expect(moveToPosition(full, full, 'd', 1)).toEqual(['d', 'a', 'b', 'c', 'e']);
    expect(moveToPosition(full, full, 'a', 99)).toEqual(['b', 'c', 'd', 'e', 'a']);
  });
  it('works on a filtered view (e.g. only KBDM rows visible)', () => {
    // visible: b, d, e — move e to position 1 of the visible rows -> placed before b
    expect(moveToPosition(full, ['b', 'd', 'e'], 'e', 1)).toEqual(['a', 'e', 'b', 'c', 'd']);
  });
});
