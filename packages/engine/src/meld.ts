/** Meld validation: books (same rank) and runs (same suit, consecutive ranks). */

import { isWild, type Card, type Rank } from './cards';

export const MIN_MELD_SIZE = 3;
/** A run spans at most ranks 3..K, i.e. 11 cards. */
export const MAX_RUN_SIZE = 11;
const LOWEST_RANK = 3;
const HIGHEST_RANK = 13;

export type MeldKind = 'book' | 'run' | 'wild';

export type MeldCheck = { ok: true; kind: MeldKind } | { ok: false; reason: string };

/**
 * Checks whether `cards` form a legal meld given the round's wild rank.
 *
 * Wild cards (Jokers and wild-rank cards) stand in for anything. A wild-rank card can
 * also represent itself, which is already covered because a wild can be any card.
 * A meld made only of wilds is allowed.
 */
export function validateMeld(cards: readonly Card[], wildRank: Rank): MeldCheck {
  if (cards.length < MIN_MELD_SIZE) {
    return { ok: false, reason: `A meld needs at least ${MIN_MELD_SIZE} cards` };
  }
  const naturals = cards.filter((c) => !isWild(c, wildRank));
  const first = naturals[0];
  if (!first) return { ok: true, kind: 'wild' };

  if (naturals.every((c) => c.rank === first.rank)) return { ok: true, kind: 'book' };

  if (!naturals.every((c) => c.suit === first.suit)) {
    return { ok: false, reason: 'Cards are neither one rank (book) nor one suit (run)' };
  }
  const ranks = naturals.map((c) => c.rank as Rank);
  if (new Set(ranks).size !== ranks.length) {
    return { ok: false, reason: 'A run cannot repeat a rank' };
  }
  if (cards.length > MAX_RUN_SIZE) {
    return { ok: false, reason: `A run has at most ${MAX_RUN_SIZE} cards` };
  }
  // The naturals must fit inside a window of `cards.length` consecutive ranks, and that
  // window must fit inside 3..K; wilds fill the gaps and extend the ends.
  const span = Math.max(...ranks) - Math.min(...ranks) + 1;
  if (span > cards.length) return { ok: false, reason: 'Run ranks are not consecutive' };
  return { ok: true, kind: 'run' };
}

export function isValidMeld(cards: readonly Card[], wildRank: Rank): boolean {
  return validateMeld(cards, wildRank).ok;
}

export { LOWEST_RANK, HIGHEST_RANK };
