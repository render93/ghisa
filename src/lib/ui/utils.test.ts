import { describe, it, expect } from 'vitest';
import { fmtDuration } from './utils';

describe('fmtDuration', () => {
  it('durate sotto l ora come minuti', () => {
    expect(fmtDuration(0)).toBe('0 min');
    expect(fmtDuration(45 * 60)).toBe('45 min');
    expect(fmtDuration(59 * 60 + 29)).toBe('59 min');
  });

  it('al confine 59m30s arrotonda a 1h 0m', () => {
    expect(fmtDuration(59 * 60 + 30)).toBe('1h 0m');
  });

  it('durate da un ora in su come Hh Mm', () => {
    expect(fmtDuration(60 * 60)).toBe('1h 0m');
    expect(fmtDuration(83 * 60)).toBe('1h 23m');
    expect(fmtDuration(125 * 60)).toBe('2h 5m');
  });
});
