/** Round structure, wild ranks, card values and the configurable rule set. */

import { isJoker, type Card, type Rank } from './cards';

export const TOTAL_ROUNDS = 11;

/** Round 1 deals 3 cards, round 11 deals 13. */
export function handSizeForRound(round: number): number {
  return round + 2;
}

/** The wild rank equals the hand size: 3s in round 1 ... Kings (13) in round 11. */
export function wildRankForRound(round: number): Rank {
  return handSizeForRound(round) as Rank;
}

/** Penalty value of a card left in hand: Joker 50, wild rank 20, J/Q/K 11/12/13, else face. */
export function cardPoints(card: Card, wildRank: Rank): number {
  if (isJoker(card)) return 50;
  if (card.rank === wildRank) return 20;
  return card.rank;
}

export function sumPoints(cards: readonly Card[], wildRank: Rank): number {
  let total = 0;
  for (const card of cards) total += cardPoints(card, wildRank);
  return total;
}

/** House-rule switches. Anything the official rules leave open lives here. */
export interface RulesConfig {
  /** Fewest players allowed. */
  minSeats: number;
  /** Most players allowed (official: 7). Hard limit is 8: 8 x 13 + 1 cards must fit in 116. */
  maxSeats: number;
  /** When the draw pile runs out, reshuffle the discard pile (minus its top card) into it. */
  reshuffleDiscardWhenStockEmpty: boolean;
  /**
   * A player who took the top discard may not discard that same card this turn.
   * A card drawn from the draw pile may always be discarded immediately.
   */
  forbidDiscardingDrawnDiscard: boolean;
}

export const DEFAULT_RULES: RulesConfig = {
  minSeats: 2,
  maxSeats: 7,
  reshuffleDiscardWhenStockEmpty: true,
  forbidDiscardingDrawnDiscard: true,
};
