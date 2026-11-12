import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DECK_SIZE, createGame, type GameEvent, type GameState } from '../src';
import { stepBot } from './bot';
import { PLAYERS } from './helpers';

const MAX_STEPS = 20000;

function checkInvariants(state: GameState): void {
  if (state.phase === 'awaitingStart') return;
  const everyCard = [
    ...state.drawPile,
    ...state.discardPile,
    ...state.players.flatMap((p) => [...p.hand, ...p.melds.flat()]),
  ];
  expect(everyCard).toHaveLength(DECK_SIZE);
  expect(new Set(everyCard.map((c) => c.id)).size).toBe(DECK_SIZE);

  const handSize = state.round + 2;
  state.players.forEach((p, i) => {
    const melded = p.melds.flat().length;
    const drew = state.phase === 'awaitingDiscard' && state.currentIndex === i;
    if (state.outPlayerId === null || state.finalTurnQueue.includes(p.id)) {
      // has not laid down: full hand (+1 right after drawing)
      expect(p.hand.length).toBe(handSize + (drew ? 1 : 0));
      expect(melded).toBe(0);
    } else if (state.phase !== 'roundOver' && state.phase !== 'gameOver') {
      expect(p.hand.length + melded).toBe(handSize);
    }
  });
}

function playGame(seed: number, playerCount: number): { final: GameState; events: GameEvent[] } {
  let state = createGame({ seed, players: PLAYERS(playerCount) });
  const events: GameEvent[] = [];
  let steps = 0;
  while (state.phase !== 'gameOver') {
    if (steps++ > MAX_STEPS)
      throw new Error(`game did not finish (seed ${seed}, ${playerCount} players)`);
    const res = stepBot(state);
    state = res.state;
    events.push(...res.events);
    checkInvariants(state);
  }
  return { final: state, events };
}

describe('bot simulations', () => {
  it('plays full games for 2-7 players keeping every invariant', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.integer({ min: 2, max: 7 }),
        (seed, n) => {
          const { final, events } = playGame(seed, n);

          expect(final.round).toBe(11);
          expect(events.filter((e) => e.type === 'roundScored')).toHaveLength(11);
          expect(events.filter((e) => e.type === 'gameOver')).toHaveLength(1);

          // totals equal the sum of per-round scores, both from state and from events
          const fromEvents = new Map<string, number>();
          for (const e of events) {
            if (e.type !== 'roundScored') continue;
            for (const s of e.scores)
              fromEvents.set(s.playerId, (fromEvents.get(s.playerId) ?? 0) + s.points);
          }
          for (const p of final.players) {
            expect(p.roundScores).toHaveLength(11);
            expect(p.score).toBe(p.roundScores.reduce((a, b) => a + b, 0));
            expect(p.score).toBe(fromEvents.get(p.id));
          }
          // exactly one player scores 0 by going out each round (others may also hit 0 on final turns)
          for (let r = 0; r < 11; r++)
            expect(final.players.some((p) => p.roundScores[r] === 0)).toBe(true);

          const lowest = Math.min(...final.players.map((p) => p.score));
          expect(final.winnerIds.sort()).toEqual(
            final.players
              .filter((p) => p.score === lowest)
              .map((p) => p.id)
              .sort(),
          );
        },
      ),
      { numRuns: 12 },
    );
  }, 120_000);

  it('is deterministic: same seed, same actions, same state and events', () => {
    const a = playGame(424242, 4);
    const b = playGame(424242, 4);
    expect(b.final).toEqual(a.final);
    expect(b.events).toEqual(a.events);
    const c = playGame(424243, 4);
    expect(c.final).not.toEqual(a.final);
  }, 60_000);

  it('state survives a JSON round trip mid-game', () => {
    let state = createGame({ seed: 77, players: PLAYERS(3) });
    state = stepBot(state).state;
    for (let i = 0; i < 40 && state.phase !== 'roundOver'; i++) {
      state = JSON.parse(JSON.stringify(state)) as GameState;
      state = stepBot(state).state;
    }
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
