import { describe, expect, it } from 'vitest';
import { validateMeld, type Card, type Rank, type Suit } from '@five-kingdoms/engine';
import { canGoOut, planDiscard, planFinalTurn, planGoOut, sortHand } from '../src/game/plans';

let nextId = 1;
const c = (rank: Rank, suit: Suit = 'stars'): Card => ({ id: nextId++, suit, rank });
const joker = (): Card => ({ id: nextId++, suit: 'joker', rank: 'joker' });

describe('planGoOut / canGoOut', () => {
  it('goes out with a book plus a spare card to discard', () => {
    const hand = [c(5, 'stars'), c(5, 'hearts'), c(5, 'clubs'), c(13, 'spades')];
    const plan = planGoOut(hand, 3);
    expect(plan).not.toBeNull();
    expect(plan!.discard.rank).toBe(13);
    expect(plan!.melds).toHaveLength(1);
    expect(validateMeld(plan!.melds[0]!, 3).ok).toBe(true);
    expect(canGoOut(hand, 3)).toBe(true);
  });

  it('is false when two cards cannot be melded', () => {
    const hand = [c(5, 'stars'), c(5, 'hearts'), c(5, 'clubs'), c(9, 'spades'), c(12, 'hearts')];
    expect(canGoOut(hand, 3)).toBe(false);
    expect(planGoOut(hand, 3)).toBeNull();
  });

  it('uses jokers and wild-rank cards as wilds', () => {
    const hand = [c(8, 'clubs'), c(9, 'clubs'), joker(), c(11, 'hearts')];
    expect(canGoOut(hand, 3)).toBe(true);
  });

  it('refuses to discard the banned card (just taken from the discard pile)', () => {
    const spare = c(13, 'spades');
    const hand = [c(5, 'stars'), c(5, 'hearts'), c(5, 'clubs'), spare];
    expect(planGoOut(hand, 3, spare.id)).toBeNull();
  });

  it('cannot go out when an extra unmeldable card remains, banned or not', () => {
    const banned = c(7, 'clubs');
    const hand = [c(5, 'stars'), c(5, 'hearts'), c(5, 'clubs'), c(13, 'spades'), banned];
    // 4 melded cards would need 7 melded too; only one discard is allowed.
    expect(canGoOut(hand, 3, banned.id)).toBe(false);
  });
});

describe('planFinalTurn', () => {
  it('discards the card that leaves the fewest points and lays down melds', () => {
    const hand = [c(5, 'stars'), c(5, 'hearts'), c(5, 'clubs'), c(13, 'spades'), c(4, 'diamonds')];
    const plan = planFinalTurn(hand, 3);
    expect(plan.discard.rank).toBe(13);
    expect(plan.melds).toHaveLength(1);
    expect(plan.restPoints).toBe(4);
  });

  it('works with no melds at all', () => {
    const hand = [c(4, 'stars'), c(9, 'hearts'), c(12, 'clubs')];
    const plan = planFinalTurn(hand, 3);
    expect(plan.melds).toHaveLength(0);
    expect(plan.discard.rank).toBe(12);
  });
});

describe('planDiscard', () => {
  it('discards the highest leftover card', () => {
    const hand = [c(5, 'stars'), c(5, 'hearts'), c(5, 'clubs'), c(6, 'diamonds'), c(13, 'spades')];
    expect(planDiscard(hand, 3).rank).toBe(13);
  });

  it('never picks the banned card', () => {
    const king = c(13, 'spades');
    const hand = [c(4, 'stars'), c(9, 'hearts'), king];
    expect(planDiscard(hand, 3, king.id).rank).toBe(9);
  });
});

describe('sortHand', () => {
  it('orders by suit then rank with jokers last', () => {
    const hand = [joker(), c(9, 'clubs'), c(4, 'stars'), c(3, 'clubs')];
    const sorted = sortHand(hand);
    expect(sorted.map((x) => x.rank)).toEqual([4, 3, 9, 'joker']);
  });
});
