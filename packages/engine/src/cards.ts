/** Card model and deck construction. */

export const SUITS = ['stars', 'hearts', 'diamonds', 'clubs', 'spades'] as const;
export type Suit = (typeof SUITS)[number];

/** Ranks 3..10 are face value; 11 = Jack, 12 = Queen, 13 = King. There are no aces. */
export const RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
export type Rank = (typeof RANKS)[number];

/** Unique per physical card (the game uses two decks, so identical faces exist). */
export type CardId = number;

export interface SuitedCard {
  readonly id: CardId;
  readonly suit: Suit;
  readonly rank: Rank;
}

export interface JokerCard {
  readonly id: CardId;
  readonly suit: 'joker';
  readonly rank: 'joker';
}

export type Card = SuitedCard | JokerCard;

export const DECK_SIZE = 116;
export const JOKERS_PER_DECK = 3;
const CARDS_PER_DECK = SUITS.length * RANKS.length + JOKERS_PER_DECK; // 58

export function isJoker(card: Card): card is JokerCard {
  return card.suit === 'joker';
}

/** Jokers are always wild; so is any card whose rank equals the round's wild rank. */
export function isWild(card: Card, wildRank: Rank): boolean {
  return card.rank === 'joker' || card.rank === wildRank;
}

/** Builds the full 116-card double deck in a fixed order. Ids are 0..115. */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < 2; deck++) {
    let id = deck * CARDS_PER_DECK;
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ id: id++, suit, rank });
    }
    for (let j = 0; j < JOKERS_PER_DECK; j++)
      cards.push({ id: id++, suit: 'joker', rank: 'joker' });
  }
  return cards;
}
