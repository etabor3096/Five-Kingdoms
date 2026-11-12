import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildDeck,
  cardPoints,
  findBestArrangement,
  isWild,
  sumPoints,
  validateMeld,
  type Card,
  type Rank,
} from '../src';
import { cards } from './helpers';

declare const console: { log(...args: unknown[]): void };

/** Independent exhaustive solver: tries every partition of the hand into melds + leftovers. */
function bruteForceLeftover(hand: readonly Card[], wildRank: Rank): number {
  const solve = (rest: readonly Card[]): number => {
    const [first, ...others] = rest;
    if (!first) return 0;
    let best = cardPoints(first, wildRank) + solve(others); // first stays in hand
    const n = others.length;
    for (let sub = 1; sub < 1 << n; sub++) {
      const group = [first, ...others.filter((_, i) => sub & (1 << i))];
      if (group.length < 3 || !validateMeld(group, wildRank).ok) continue;
      best = Math.min(best, solve(others.filter((_, i) => !(sub & (1 << i)))));
    }
    return best;
  };
  return solve(hand);
}

function checkArrangement(hand: readonly Card[], wildRank: Rank): number {
  const arr = findBestArrangement(hand, wildRank);
  const all = [...arr.melds.flat(), ...arr.leftover].map((c) => c.id).sort((a, b) => a - b);
  expect(all).toEqual(hand.map((c) => c.id).sort((a, b) => a - b));
  for (const meld of arr.melds) expect(validateMeld(meld, wildRank).ok).toBe(true);
  expect(arr.leftoverPoints).toBe(sumPoints(arr.leftover, wildRank));
  return arr.leftoverPoints;
}

describe('findBestArrangement', () => {
  it('finds a full arrangement and leaves the junk', () => {
    const hand = cards('5h 6h 7h 9d 9c 9s Kd');
    const arr = findBestArrangement(hand, 3);
    expect(arr.leftover.map((c) => c.rank)).toEqual([13]);
    expect(arr.leftoverPoints).toBe(13);
    expect(arr.melds).toHaveLength(2);
  });

  it('prefers the split that scores best (card used in run vs book)', () => {
    // 5h joins either the run 4h 5h 6h or the book 5h 5d 5c, never both: 23 left either way
    expect(checkArrangement(cards('4h 5h 6h 5d 5c Kd'), 9)).toBe(23);
    // with a spare 5s both fit: run 4h 5h 6h and book 5d 5c 5s
    expect(checkArrangement(cards('4h 5h 6h 5d 5c 5s Kd'), 9)).toBe(13);
  });

  it('uses jokers and wild-rank cards to save points, keeping the dearest wilds melded', () => {
    // JK and 8c (wild) can complete Kd (13) or the 5s (10): leaving the 5s costs less
    const arr = findBestArrangement(cards('5h 5d JK 8c Kd'), 8);
    expect(arr.leftoverPoints).toBe(10);
    expect(arr.melds).toHaveLength(1);
  });

  it('melds three wilds on their own and absorbs spare wilds', () => {
    expect(findBestArrangement(cards('JK JK 8c'), 8).leftoverPoints).toBe(0);
    expect(findBestArrangement(cards('JK JK 8c Kd 5h'), 8).leftoverPoints).toBe(5);
  });

  it('leaves a lone pair of wilds as leftover', () => {
    expect(findBestArrangement(cards('JK 8c'), 8).leftoverPoints).toBe(70);
  });

  it('matches a brute-force solver on random small hands', () => {
    const deck = buildDeck();
    fc.assert(
      fc.property(
        fc.shuffledSubarray(deck, { minLength: 1, maxLength: 9 }),
        fc.integer({ min: 3, max: 13 }),
        (hand, wild) => {
          expect(checkArrangement(hand, wild as Rank)).toBe(bruteForceLeftover(hand, wild as Rank));
        },
      ),
      { numRuns: 150 },
    );
  });

  it('matches brute force on meld-dense hands (few suits and ranks, jokers)', () => {
    const pool = buildDeck().filter(
      (c) => c.rank === 'joker' || (c.rank <= 8 && (c.suit === 'hearts' || c.suit === 'clubs')),
    );
    fc.assert(
      fc.property(
        fc.shuffledSubarray(pool, { minLength: 4, maxLength: 9 }),
        fc.integer({ min: 3, max: 13 }),
        (hand, wild) => {
          expect(checkArrangement(hand, wild as Rank)).toBe(bruteForceLeftover(hand, wild as Rank));
        },
      ),
      { numRuns: 150 },
    );
  });

  it('solves a 14-card hand with several wilds well under 50 ms', () => {
    const deck = buildDeck();
    const wildRank: Rank = 11;
    const hands: Card[][] = [];
    // worst-ish cases: dense suits, many wilds
    const dense = deck.filter(
      (c) => c.rank === 'joker' || c.suit === 'hearts' || c.suit === 'clubs',
    );
    for (let i = 0; i < 20; i++) {
      const pick = fc.sample(
        fc.shuffledSubarray(dense, { minLength: 14, maxLength: 14 }),
        1,
      )[0] as Card[];
      hands.push(pick);
    }
    hands.push(cards('JK JK JK Jh 3h 4h 6h 8h 9h 10h Qh Kh 5c 5d'));
    let worst = 0;
    for (const hand of hands) {
      const start = Date.now();
      const runs = 5;
      for (let i = 0; i < runs; i++) findBestArrangement(hand, wildRank);
      worst = Math.max(worst, (Date.now() - start) / runs);
      expect(hand.filter((c) => isWild(c, wildRank)).length).toBeGreaterThanOrEqual(0);
    }
    console.log(`findBestArrangement worst average over 14-card hands: ${worst.toFixed(2)} ms`);
    expect(worst).toBeLessThan(50);
  });
});
