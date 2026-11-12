import { describe, expect, it } from 'vitest';
import { RANKS, SUITS, buildDeck, isJoker } from '../src';

describe('deck', () => {
  const deck = buildDeck();

  it('has 116 cards with unique ids', () => {
    expect(deck).toHaveLength(116);
    expect(new Set(deck.map((c) => c.id)).size).toBe(116);
  });

  it('has 6 jokers and 110 suited cards', () => {
    expect(deck.filter(isJoker)).toHaveLength(6);
    expect(deck.filter((c) => !isJoker(c))).toHaveLength(110);
  });

  it('has 22 cards per suit and 10 per rank', () => {
    for (const suit of SUITS) expect(deck.filter((c) => c.suit === suit)).toHaveLength(22);
    for (const rank of RANKS) expect(deck.filter((c) => c.rank === rank)).toHaveLength(10);
  });

  it('has exactly two of each suit+rank', () => {
    for (const suit of SUITS)
      for (const rank of RANKS)
        expect(deck.filter((c) => c.suit === suit && c.rank === rank)).toHaveLength(2);
  });
});
