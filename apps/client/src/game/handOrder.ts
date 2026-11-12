/** Keeps the hand in a stable, player-controlled order as cards come and go. */

import type { Card, CardId } from '@five-kingdoms/engine';
import { sortHand } from './plans';

/**
 * Returns the display order for `hand`: cards already shown keep their place, cards that left
 * disappear, and newly drawn cards are appended on the right.
 */
export function reconcileOrder(previous: readonly CardId[], hand: readonly Card[]): CardId[] {
  const inHand = new Set(hand.map((c) => c.id));
  const kept = previous.filter((id) => inHand.has(id));
  const known = new Set(kept);
  return [...kept, ...hand.filter((c) => !known.has(c.id)).map((c) => c.id)];
}

/** Orders `hand` by suit and rank and returns just the ids. */
export function sortedOrder(hand: readonly Card[]): CardId[] {
  return sortHand(hand).map((c) => c.id);
}

/** Maps an id order back to cards, skipping any id that is not in `hand`. */
export function applyOrder(order: readonly CardId[], hand: readonly Card[]): Card[] {
  const byId = new Map(hand.map((c) => [c.id, c] as const));
  return order.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
}
