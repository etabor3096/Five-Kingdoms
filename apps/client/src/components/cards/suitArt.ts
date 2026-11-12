/**
 * Vector art for the five kingdoms. Each kingdom has a crest outline of its own shape (so it
 * can be told apart without colour) that holds the classic suit symbol.
 * Crests are drawn in a 40 x 40 box and symbols in a 24 x 24 box.
 */

import type { Suit } from '@five-kingdoms/engine';

export const CREST_BOX = 40;
export const SYMBOL_BOX = 24;

/** Crest outlines. Stars: hexagon. Hearts: shield. Diamonds: octagon. Clubs: round. Spades: arch. */
export const CREST_PATHS: Record<Suit, string> = {
  stars: 'M20 1 L37 10.5 L37 29.5 L20 39 L3 29.5 L3 10.5 Z',
  hearts: 'M4 4 H36 V22 C36 31 28 36 20 39 C12 36 4 31 4 22 Z',
  diamonds: 'M13 2 H27 L38 13 V27 L27 38 H13 L2 27 V13 Z',
  clubs: 'M20 2 A18 18 0 1 1 19.99 2 Z',
  spades: 'M4 39 V17 C4 8 12 3 20 1 C28 3 36 8 36 17 V39 Z',
};

/** Classic suit symbols in a 24 x 24 box (stars use the five-point star). */
export const SYMBOL_PATHS: Record<Suit, string> = {
  stars:
    'M12 1.5 L14.9 8.6 L22.5 9.2 L16.7 14.1 L18.5 21.5 L12 17.5 L5.5 21.5 L7.3 14.1 L1.5 9.2 L9.1 8.6 Z',
  hearts:
    'M12 22 C4 15 1.5 10.5 4.5 6 C7 3 10.5 4 12 7 C13.5 4 17 3 19.5 6 C22.5 10.5 20 15 12 22 Z',
  diamonds: 'M12 1.5 L21 12 L12 22.5 L3 12 Z',
  clubs:
    'M12 2 A4.6 4.6 0 1 1 12 11.2 A4.6 4.6 0 1 1 12 2 Z M6.5 10 A4.6 4.6 0 1 1 6.5 19.2 A4.6 4.6 0 1 1 6.5 10 Z M17.5 10 A4.6 4.6 0 1 1 17.5 19.2 A4.6 4.6 0 1 1 17.5 10 Z M12 12 L9.5 22.5 L14.5 22.5 Z',
  spades:
    'M12 1.5 C12 1.5 2.5 9 2.5 14.5 C2.5 18 6.5 19 9.6 16.4 C9.3 19.5 8.5 21 7 22.5 L17 22.5 C15.5 21 14.7 19.5 14.4 16.4 C17.5 19 21.5 18 21.5 14.5 C21.5 9 12 1.5 12 1.5 Z',
};

/** Short accessible names, e.g. for screen readers: "7 of Hearts". */
export function rankLabel(rank: number | 'joker'): string {
  if (rank === 'joker') return 'Joker';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}
