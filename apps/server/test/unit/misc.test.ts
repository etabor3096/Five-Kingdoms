import { describe, expect, it } from 'vitest';
import { allowAction } from '../../src/rate-limit';
import { nextHost } from '../../src/room-state';
import { generateToken, hashToken, hashesEqual } from '../../src/token';

describe('tokens', () => {
  it('generates unique 256-bit hex tokens and hashes deterministically', async () => {
    const a = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(generateToken()).not.toBe(a);
    const h = await hashToken(a);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toBe(a);
    expect(await hashToken(a)).toBe(h);
    expect(hashesEqual(h, await hashToken(a))).toBe(true);
    expect(hashesEqual(h, await hashToken('other'))).toBe(false);
    expect(hashesEqual(h, 'short')).toBe(false);
  });
});

describe('emote rate limit', () => {
  it('allows one action per second per seat', () => {
    const last = new Map<number, number>();
    expect(allowAction(last, 0, 1000)).toBe(true);
    expect(allowAction(last, 0, 1500)).toBe(false);
    expect(allowAction(last, 1, 1500)).toBe(true);
    expect(allowAction(last, 0, 2000)).toBe(true);
  });
});

describe('host migration', () => {
  it('picks the next connected seat after the host, wrapping around', () => {
    expect(nextHost(0, [0, 1, 2], new Set([1, 2]))).toBe(1);
    expect(nextHost(1, [0, 1, 2], new Set([0, 2]))).toBe(2);
    expect(nextHost(2, [0, 1, 2], new Set([0, 1]))).toBe(0);
    expect(nextHost(0, [0, 1, 2], new Set([2]))).toBe(2);
    expect(nextHost(0, [0, 1], new Set())).toBeNull();
  });
});
