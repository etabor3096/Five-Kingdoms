import { describe, expect, it } from 'vitest';
import { applyAction, createGame, handSizeForRound, wildRankForRound } from '../src';
import { PLAYERS, must } from './helpers';

describe('round setup', () => {
  it('deals 3..13 cards with wild rank equal to the hand size', () => {
    for (let round = 1; round <= 11; round++) {
      expect(handSizeForRound(round)).toBe(round + 2);
      expect(wildRankForRound(round)).toBe(round + 2);
    }
  });

  it('deals correctly, turns up one card, and the player left of the dealer starts', () => {
    const game = createGame({ seed: 5, players: PLAYERS(4), firstDealerSeat: 2 });
    const { state, events } = must(game, 'p0', { type: 'startNextRound' });
    expect(state.round).toBe(1);
    expect(state.wildRank).toBe(3);
    expect(state.players.every((p) => p.hand.length === 3)).toBe(true);
    expect(state.discardPile).toHaveLength(1);
    expect(state.drawPile).toHaveLength(116 - 12 - 1);
    expect(state.dealerIndex).toBe(2);
    expect(state.currentIndex).toBe(3);
    expect(state.phase).toBe('awaitingDraw');
    expect(events[0]).toMatchObject({ type: 'roundStarted', dealerId: 'p2', firstPlayerId: 'p3' });
  });

  it('rotates the dealer clockwise each round and sizes hands up to 13', () => {
    let state = createGame({ seed: 9, players: PLAYERS(3), firstDealerSeat: 1 });
    const dealers: number[] = [];
    for (let round = 1; round <= 11; round++) {
      state = must(state, 'p0', { type: 'startNextRound' }).state;
      dealers.push(state.dealerIndex);
      expect(state.round).toBe(round);
      expect(state.wildRank).toBe(round + 2);
      expect(state.players.every((p) => p.hand.length === round + 2)).toBe(true);
      expect(state.currentIndex).toBe((state.dealerIndex + 1) % 3);
      // fake the end of the round to allow the next start
      state = { ...state, phase: 'roundOver' };
    }
    expect(dealers).toEqual([1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2]);
  });

  it('picks the round-1 dealer from the seeded PRNG by default, deterministically', () => {
    const a = createGame({ seed: 123, players: PLAYERS(5) });
    const b = createGame({ seed: 123, players: PLAYERS(5) });
    expect(a.dealerIndex).toBe(b.dealerIndex);
    const seats = new Set(
      Array.from(
        { length: 60 },
        (_, s) => createGame({ seed: s, players: PLAYERS(5) }).dealerIndex,
      ),
    );
    expect(seats.size).toBeGreaterThan(1);
    for (const s of seats) expect(s).toBeGreaterThanOrEqual(0);
  });

  it('honours firstDealerSeat and rejects bad config', () => {
    expect(createGame({ seed: 1, players: PLAYERS(4), firstDealerSeat: 3 }).dealerIndex).toBe(3);
    expect(() => createGame({ seed: 1, players: PLAYERS(4), firstDealerSeat: 4 })).toThrow(
      RangeError,
    );
    expect(() => createGame({ seed: 1, players: PLAYERS(1) })).toThrow(RangeError);
    expect(() => createGame({ seed: 1, players: PLAYERS(8) })).toThrow(RangeError);
    expect(
      createGame({ seed: 1, players: PLAYERS(8), rules: { maxSeats: 8 } }).players,
    ).toHaveLength(8);
    expect(() =>
      createGame({
        seed: 1,
        players: [
          { id: 'a', name: 'A' },
          { id: 'a', name: 'B' },
        ],
      }),
    ).toThrow(RangeError);
  });

  it('rejects startNextRound mid-round', () => {
    const state = must(createGame({ seed: 1, players: PLAYERS(2) }), 'p0', {
      type: 'startNextRound',
    }).state;
    const again = applyAction(state, 'p0', { type: 'startNextRound' });
    expect(again).toMatchObject({ ok: false, error: { code: 'WRONG_PHASE' } });
  });
});
