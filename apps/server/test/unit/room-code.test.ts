import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, generateRoomCode, isValidRoomCode } from '../../src/room-code';

describe('room codes', () => {
  it('has no ambiguous characters', () => {
    for (const ch of '01OIL') expect(CODE_ALPHABET).not.toContain(ch);
  });

  it('generates 5-character codes from the alphabet', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(5);
      expect(isValidRoomCode(code)).toBe(true);
    }
  });

  it('is not constant', () => {
    expect(new Set(Array.from({ length: 50 }, () => generateRoomCode())).size).toBeGreaterThan(40);
  });

  it('rejects bad codes', () => {
    for (const bad of [
      '',
      'ABCD',
      'ABCDEFG',
      'ABCD0',
      'ABCDO',
      'ABCD1',
      'ABCDI',
      'ABCDL',
      'abcde',
    ]) {
      expect(isValidRoomCode(bad)).toBe(false);
    }
  });
});
