import { describe, expect, it } from 'vitest';
import { validateMeld, type Rank } from '../src';
import { cards } from './helpers';

// [description, cards, wildRank, expected kind or null when invalid]
const table: [string, string, Rank, 'book' | 'run' | 'wild' | null][] = [
  ['book of three', '5h 5d 5c', 8, 'book'],
  ['book with same-suit duplicates', '5h 5h 5h', 8, 'book'],
  ['book of five incl. duplicates', '9h 9h 9d 9c 9s', 4, 'book'],
  ['book with a joker', '5h 5d JK', 8, 'book'],
  ['book with a wild-rank card', '5h 5d 8c', 8, 'book'],
  ['plain run', '4h 5h 6h', 8, 'run'],
  ['run up to king', 'Qh Kh Jh', 3, 'run'],
  ['full 11-card run 3..K', '3h 4h 5h 6h 7h 8h 9h 10h Jh Qh Kh', 9, 'run'],
  ['wild fills a gap', '4h JK 6h', 8, 'run'],
  ['wild-rank card fills a gap', '4h 8c 6h', 8, 'run'],
  ['wild extends the top', '4h 5h JK', 9, 'run'],
  ['wild extends the bottom', 'JK 5h 6h', 9, 'run'],
  ['wilds at both ends', 'JK 6h 7h JK', 9, 'run'],
  ['run ending at king with wild below', 'JK Qh Kh', 8, 'run'],
  ['all jokers', 'JK JK JK', 5, 'wild'],
  ['joker + wild-rank cards', 'JK 5h 5d', 5, 'wild'],
  ['wild-rank card used as itself in a run', '3h 4h 5h', 3, 'run'],
  ['wild-rank card used as itself in a book', '7h 7d 7c', 7, 'wild'],
  ['only two cards', '5h 5d', 8, null],
  ['two cards plus nothing: wild pair', 'JK JK', 8, null],
  ['mixed suits in a run', '4h 5d 6h', 8, null],
  ['non-consecutive run', '4h 6h 9h', 8, null],
  ['gap too big for the wilds', '4h 9h JK', 8, null],
  ['run past king (needs 14)', 'Qh Kh JK JK JK JK JK JK JK JK JK JK', 8, null],
  ['run does not wrap', 'Qh Kh 3h', 8, null],
  ['run repeating a rank', '4h 4h 5h', 8, null],
  ['mixed ranks and suits', '4h 5d 6c', 9, null],
  ['wilds extend downward from king', 'Kh Qh JK JK', 8, 'run'],
  ['12-card run is too long', '3h 4h 5h 6h 7h 8h 9h 10h Jh Qh Kh JK', 2 as Rank, null],
];

describe('validateMeld', () => {
  it.each(table)('%s', (_name, text, wild, expected) => {
    const result = validateMeld(cards(text), wild);
    if (expected === null) expect(result.ok).toBe(false);
    else expect(result).toEqual({ ok: true, kind: expected });
  });
});
