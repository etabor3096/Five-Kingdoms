import { createGame, applyAction } from '../src/game';
import type { Action, GameState } from '../src/state';
import type { Card, Rank, Suit } from '../src/cards';

const SUIT_BY_CHAR: Record<string, Suit> = {
  '*': 'stars',
  h: 'hearts',
  d: 'diamonds',
  c: 'clubs',
  s: 'spades',
};
const RANK_BY_TEXT: Record<string, Rank> = { J: 11, Q: 12, K: 13 };

let nextId = 1000;

/** Parses "5h 10c Ks JK 7*" (* = stars, JK = joker) into cards with fresh unique ids. */
export function cards(text: string): Card[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((token): Card => {
      const id = nextId++;
      if (token === 'JK') return { id, suit: 'joker', rank: 'joker' };
      const suit = SUIT_BY_CHAR[token.slice(-1)];
      const rankText = token.slice(0, -1);
      const rank = RANK_BY_TEXT[rankText] ?? (Number(rankText) as Rank);
      if (!suit || !(rank >= 3 && rank <= 13)) throw new Error(`Bad card token ${token}`);
      return { id, suit, rank };
    });
}

export const ids = (list: readonly Card[]): number[] => list.map((c) => c.id);

export const PLAYERS = (n: number): { id: string; name: string }[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));

/** Applies an action and fails the test loudly if it is rejected. */
export function must(state: GameState, playerId: string, action: Action) {
  const result = applyAction(state, playerId, action);
  if (!result.ok)
    throw new Error(
      `${action.type} by ${playerId} rejected: ${result.error.code} ${result.error.message}`,
    );
  return result;
}

/** A started round-N game with p0 dealing from seat 0 and the given hands/piles forced in. */
export function rigged(opts: {
  players?: number;
  hands: string[];
  discard?: string;
  stock?: string;
  rules?: Partial<GameState['rules']>;
  /** Advance to this round by faking it (state.round and wild rank). */
  round?: number;
}): GameState {
  const n = opts.players ?? opts.hands.length;
  const game = createGame({
    seed: 1,
    players: PLAYERS(n),
    firstDealerSeat: 0,
    rules: opts.rules ?? {},
  });
  const started = must(game, 'p0', { type: 'startNextRound' }).state;
  const round = opts.round ?? 1;
  return {
    ...started,
    round,
    wildRank: (round + 2) as Rank,
    players: started.players.map((p, i) => ({ ...p, hand: cards(opts.hands[i] ?? '') })),
    discardPile: cards(opts.discard ?? '9h'),
    drawPile: cards(opts.stock ?? '4d 4c 4s 9d 9c 9s'),
  };
}
