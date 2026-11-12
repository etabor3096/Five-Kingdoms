/** Finds the arrangement of a hand into melds that leaves the fewest penalty points. */

import { isWild, type Card, type Rank } from './cards';
import { MAX_RUN_SIZE, MIN_MELD_SIZE } from './meld';
import { cardPoints, sumPoints } from './rules';

export interface Arrangement {
  melds: Card[][];
  leftover: Card[];
  leftoverPoints: number;
}

interface Candidate {
  /** Bitmask over the natural cards used. */
  mask: number;
  /** Wild cards needed to make this a legal meld. */
  wilds: number;
  points: number;
  kind: 'book' | 'run';
}

const MAX_HAND = 30;

/**
 * Returns the set of disjoint melds that minimises the points left in hand.
 *
 * Wilds fit into any meld, so they never cost anything once at least one meld exists
 * (or three wilds can form a meld alone). The search therefore maximises the natural
 * points covered, spending at most as many wilds as the hand holds. Only the 11-card
 * run limit could stop a spare wild from being absorbed; that corner needs 11 cards of
 * one suit in a hand and is handled on a best-effort basis.
 */
export function findBestArrangement(hand: readonly Card[], wildRank: Rank): Arrangement {
  if (hand.length > MAX_HAND) throw new RangeError(`Hand too large (max ${MAX_HAND})`);

  // Jokers (50) before wild-rank cards (20): the dearest wilds go into melds first.
  const wilds = hand
    .filter((c) => isWild(c, wildRank))
    .sort((a, b) => cardPoints(b, wildRank) - cardPoints(a, wildRank));
  const naturals = hand.filter((c) => !isWild(c, wildRank));
  const candidates = buildCandidates(naturals, wilds.length);

  const byLowestBit: Candidate[][] = naturals.map(() => []);
  for (const c of candidates) byLowestBit[31 - Math.clz32(c.mask & -c.mask)]?.push(c);

  const memo = new Map<number, number>();
  /** Best natural points coverable from the undecided cards `open` with `w` wilds left. */
  const solve = (open: number, w: number): number => {
    if (open === 0) return 0;
    const key = open * 32 + w;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const low = 31 - Math.clz32(open & -open);
    let best = solve(open & ~(1 << low), w); // leave this card unmelded
    for (const c of byLowestBit[low] ?? []) {
      if ((c.mask & ~open) !== 0 || c.wilds > w) continue;
      best = Math.max(best, c.points + solve(open & ~c.mask, w - c.wilds));
    }
    memo.set(key, best);
    return best;
  };

  // Rebuild the chosen melds by replaying the search.
  const chosen: Candidate[] = [];
  let open = (1 << naturals.length) - 1;
  let w = wilds.length;
  while (open !== 0) {
    const low = 31 - Math.clz32(open & -open);
    const target = solve(open, w);
    if (solve(open & ~(1 << low), w) === target) {
      open &= ~(1 << low);
      continue;
    }
    const pick = (byLowestBit[low] ?? []).find(
      (c) =>
        (c.mask & ~open) === 0 &&
        c.wilds <= w &&
        c.points + solve(open & ~c.mask, w - c.wilds) === target,
    );
    if (!pick) throw new Error('unreachable: search replay diverged');
    chosen.push(pick);
    open &= ~pick.mask;
    w -= pick.wilds;
  }

  const melds: Card[][] = [];
  const kinds: ('book' | 'run' | 'wild')[] = [];
  let nextWild = 0;
  const covered = new Set<number>();
  for (const c of chosen) {
    const cards: Card[] = [];
    naturals.forEach((card, i) => {
      if (c.mask & (1 << i)) {
        cards.push(card);
        covered.add(i);
      }
    });
    for (let k = 0; k < c.wilds; k++) cards.push(wilds[nextWild++] as Card);
    melds.push(cards);
    kinds.push(c.kind);
  }

  // Spare wilds join an existing meld (books take any number, runs up to 11 cards).
  const leftoverWilds: Card[] = [];
  for (; nextWild < wilds.length; nextWild++) {
    const wild = wilds[nextWild] as Card;
    let target = kinds.indexOf('book');
    if (target < 0)
      target = melds.findIndex((m, i) => kinds[i] === 'run' && m.length < MAX_RUN_SIZE);
    if (target < 0 && melds.length > 0 && kinds.includes('wild')) target = kinds.indexOf('wild');
    if (target >= 0) (melds[target] as Card[]).push(wild);
    else leftoverWilds.push(wild);
  }
  if (leftoverWilds.length >= MIN_MELD_SIZE) {
    melds.push(leftoverWilds.splice(0));
    kinds.push('wild');
  }

  const leftover = [...naturals.filter((_, i) => !covered.has(i)), ...leftoverWilds];
  return { melds, leftover, leftoverPoints: sumPoints(leftover, wildRank) };
}

function buildCandidates(naturals: readonly Card[], wildBudget: number): Candidate[] {
  const out: Candidate[] = [];
  const pts = (i: number): number => naturals[i]?.rank as number;

  // Books: every non-empty subset of each same-rank group.
  const byRank = new Map<number, number[]>();
  naturals.forEach((c, i) =>
    byRank.set(c.rank as number, [...(byRank.get(c.rank as number) ?? []), i]),
  );
  for (const group of byRank.values()) {
    for (let sub = 1; sub < 1 << group.length; sub++) {
      let mask = 0;
      let size = 0;
      let points = 0;
      group.forEach((idx, j) => {
        if (sub & (1 << j)) {
          mask |= 1 << idx;
          size++;
          points += pts(idx);
        }
      });
      const wilds = Math.max(0, MIN_MELD_SIZE - size);
      if (wilds <= wildBudget) out.push({ mask, wilds, points, kind: 'book' });
    }
  }

  // Runs: per suit, pick at most one card per rank in increasing order. Gaps between
  // chosen ranks (and padding up to 3 cards) are filled by wilds.
  const bySuit = new Map<string, number[]>();
  naturals.forEach((c, i) => bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), i]));
  for (const idxs of bySuit.values()) {
    const sorted = [...idxs].sort((a, b) => pts(a) - pts(b));
    const walk = (
      from: number,
      mask: number,
      count: number,
      points: number,
      lo: number,
      hi: number,
    ): void => {
      if (count > 0) {
        const wilds = Math.max(hi - lo + 1, MIN_MELD_SIZE) - count;
        if (wilds <= wildBudget) out.push({ mask, wilds, points, kind: 'run' });
      }
      for (let k = from; k < sorted.length; k++) {
        const idx = sorted[k] as number;
        const rank = pts(idx);
        if (count > 0 && rank === hi) continue; // one card per rank
        const newLo = count === 0 ? rank : lo;
        const gaps = rank - newLo + 1 - (count + 1);
        if (gaps > wildBudget) break; // ranks only get further apart from here
        walk(k + 1, mask | (1 << idx), count + 1, points + rank, newLo, rank);
      }
    };
    walk(0, 0, 0, 0, 0, 0);
  }
  return out;
}
