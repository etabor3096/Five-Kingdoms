import { describe, expect, it } from 'vitest';
import { allowAction } from '../../src/rate-limit';
import { advanceTurnClock, nextHost, turnKey } from '../../src/room-state';
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

describe('turn clock', () => {
  const TURN = 60_000;

  it('starts a new turn with the full time', () => {
    expect(advanceTurnClock(null, turnKey(1, 0), false, 1000, TURN)).toEqual({
      key: '1:0',
      deadline: 61_000,
      remainingMs: TURN,
    });
  });

  it('leaves a running clock alone, so later changes do not extend the turn', () => {
    const clock = advanceTurnClock(null, '1:0', false, 1000, TURN);
    expect(advanceTurnClock(clock, '1:0', false, 30_000, TURN)).toBe(clock);
  });

  it('gives the next turn a fresh clock', () => {
    const clock = advanceTurnClock(null, '1:0', false, 1000, TURN);
    expect(advanceTurnClock(clock, '1:1', false, 30_000, TURN).deadline).toBe(90_000);
  });

  it('stops while paused and resumes with the time that was left', () => {
    const running = advanceTurnClock(null, '1:0', false, 1000, TURN);
    const paused = advanceTurnClock(running, '1:0', true, 41_000, TURN);
    expect(paused).toEqual({ key: '1:0', deadline: null, remainingMs: 20_000 });
    // Still paused much later: nothing changes.
    expect(advanceTurnClock(paused, '1:0', true, 500_000, TURN)).toBe(paused);
    expect(advanceTurnClock(paused, '1:0', false, 600_000, TURN).deadline).toBe(620_000);
  });

  it('a turn that begins during a pause waits with the full time', () => {
    const paused = advanceTurnClock(null, '2:1', true, 1000, TURN);
    expect(paused).toEqual({ key: '2:1', deadline: null, remainingMs: TURN });
  });
});
