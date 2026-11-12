import { describe, expect, it } from 'vitest';
import {
  clearDeadline,
  nextAlarmTime,
  setDeadline,
  takeDue,
  type Schedule,
} from '../../src/schedule';

describe('alarm schedule', () => {
  it('is empty by default', () => {
    expect(nextAlarmTime([])).toBeNull();
  });

  it('points at the earliest deadline', () => {
    let s: Schedule = setDeadline([], 'expiry', 5000);
    s = setDeadline(s, 'pause', 2000);
    expect(nextAlarmTime(s)).toBe(2000);
    s = clearDeadline(s, 'pause');
    expect(nextAlarmTime(s)).toBe(5000);
    expect(nextAlarmTime(clearDeadline(s, 'expiry'))).toBeNull();
  });

  it('replaces a deadline with the same id', () => {
    const s = setDeadline(setDeadline([], 'pause', 1000), 'pause', 9000);
    expect(s).toEqual([{ id: 'pause', at: 9000 }]);
  });

  it('does not mutate its input', () => {
    const s: Schedule = Object.freeze([{ id: 'a', at: 1 }]);
    setDeadline(s, 'b', 2);
    clearDeadline(s, 'a');
    expect(s).toEqual([{ id: 'a', at: 1 }]);
  });

  it('splits due from future deadlines, earliest first', () => {
    const s: Schedule = [
      { id: 'late', at: 300 },
      { id: 'b', at: 200 },
      { id: 'a', at: 100 },
    ];
    const { due, rest } = takeDue(s, 200);
    expect(due.map((d) => d.id)).toEqual(['a', 'b']);
    expect(rest).toEqual([{ id: 'late', at: 300 }]);
  });
});
