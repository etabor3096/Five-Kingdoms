/**
 * Turns the engine's meld solver into concrete moves: whether a hand can go out, what to
 * discard, and how to pre-fill the arrange screen. Pure functions over engine types.
 */

import {
  cardPoints,
  findBestArrangement,
  type Card,
  type CardId,
  type Rank,
} from '@five-kingdoms/engine';

/** A suggested set of melds plus the card to discard. */
export interface TurnPlan {
  melds: Card[][];
  discard: Card;
  /** Cards neither melded nor discarded (they stay in hand and are scored). */
  rest: Card[];
  restPoints: number;
}

function without(hand: readonly Card[], card: Card): Card[] {
  return hand.filter((c) => c.id !== card.id);
}

/**
 * Looks for a discard such that every other card melds. `bannedDiscardId` is the card just
 * taken from the discard pile, which the rules forbid discarding again.
 * Returns null when the hand cannot go out. Among valid discards the dearest one is chosen.
 */
export function planGoOut(
  hand: readonly Card[],
  wildRank: Rank,
  bannedDiscardId: CardId | null = null,
): TurnPlan | null {
  let best: TurnPlan | null = null;
  for (const discard of hand) {
    if (discard.id === bannedDiscardId) continue;
    const arr = findBestArrangement(without(hand, discard), wildRank);
    if (arr.leftover.length > 0) continue;
    if (!best || cardPoints(discard, wildRank) > cardPoints(best.discard, wildRank)) {
      best = { melds: arr.melds, discard, rest: [], restPoints: 0 };
    }
  }
  return best;
}

/** True when the player may go out with this hand (14th card included). */
export function canGoOut(
  hand: readonly Card[],
  wildRank: Rank,
  bannedDiscardId: CardId | null = null,
): boolean {
  return planGoOut(hand, wildRank, bannedDiscardId) !== null;
}

/**
 * Best final-turn play: discard whichever card leaves the fewest penalty points once the
 * rest is arranged. Ties go to the dearer discard.
 */
export function planFinalTurn(
  hand: readonly Card[],
  wildRank: Rank,
  bannedDiscardId: CardId | null = null,
): TurnPlan {
  let best: TurnPlan | null = null;
  for (const discard of hand) {
    if (discard.id === bannedDiscardId) continue;
    const arr = findBestArrangement(without(hand, discard), wildRank);
    const better =
      !best ||
      arr.leftoverPoints < best.restPoints ||
      (arr.leftoverPoints === best.restPoints &&
        cardPoints(discard, wildRank) > cardPoints(best.discard, wildRank));
    if (better) {
      best = { melds: arr.melds, discard, rest: arr.leftover, restPoints: arr.leftoverPoints };
    }
  }
  if (!best) throw new RangeError('Cannot plan a turn with an empty hand');
  return best;
}

/**
 * Simple discard choice: the highest-value card the best arrangement leaves over.
 * Falls back to the highest-value card allowed when everything is melded.
 */
export function planDiscard(
  hand: readonly Card[],
  wildRank: Rank,
  bannedDiscardId: CardId | null = null,
): Card {
  const allowed = hand.filter((c) => c.id !== bannedDiscardId);
  const arr = findBestArrangement(hand, wildRank);
  const pool = arr.leftover.filter((c) => c.id !== bannedDiscardId);
  const byValue = (cards: readonly Card[]): Card =>
    cards.reduce((a, b) => (cardPoints(b, wildRank) > cardPoints(a, wildRank) ? b : a));
  if (pool.length > 0) return byValue(pool);
  if (allowed.length === 0) throw new RangeError('Nothing to discard');
  return byValue(allowed);
}

/** Orders cards by suit then rank (Jokers last) for the optional "sort hand" button. */
export function sortHand(hand: readonly Card[]): Card[] {
  const suitOrder = ['stars', 'hearts', 'diamonds', 'clubs', 'spades', 'joker'];
  const rankOf = (c: Card): number => (c.rank === 'joker' ? 99 : c.rank);
  return [...hand].sort(
    (a, b) =>
      suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit) || rankOf(a) - rankOf(b) || a.id - b.id,
  );
}
