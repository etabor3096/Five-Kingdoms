import { describe, expect, it } from 'vitest';
import type { Card, PlayerView } from '@five-kingdoms/engine';
import { applyOrder, reconcileOrder, sortedOrder } from '../src/game/handOrder';
import { rankPlayers } from '../src/game/standings';

const card = (id: number, rank: number, suit = 'stars'): Card => ({ id, rank, suit }) as Card;
const player = (id: string, score: number): PlayerView => ({ id, name: id, score }) as PlayerView;

describe('hand order', () => {
  it('keeps positions, drops played cards and appends new ones', () => {
    const hand = [card(1, 5), card(2, 6), card(3, 7)];
    expect(reconcileOrder([], hand)).toEqual([1, 2, 3]);
    expect(reconcileOrder([3, 1, 2], hand)).toEqual([3, 1, 2]);
    const next = [card(1, 5), card(3, 7), card(9, 4)];
    expect(reconcileOrder([3, 1, 2], next)).toEqual([3, 1, 9]);
  });

  it('applies an order and sorts by suit then rank', () => {
    const hand = [card(1, 9, 'clubs'), card(2, 4, 'stars'), card(3, 3, 'clubs')];
    expect(applyOrder([2, 1, 3], hand).map((c) => c.id)).toEqual([2, 1, 3]);
    expect(applyOrder([2, 77], hand).map((c) => c.id)).toEqual([2]);
    expect(sortedOrder(hand)).toEqual([2, 3, 1]);
  });
});

describe('rankPlayers', () => {
  it('orders low to high and shares ranks on ties', () => {
    const ranked = rankPlayers([
      player('a', 40),
      player('b', 12),
      player('c', 40),
      player('d', 12),
    ]);
    expect(ranked.map((r) => [r.player.id, r.rank])).toEqual([
      ['b', 1],
      ['d', 1],
      ['a', 3],
      ['c', 3],
    ]);
  });
});
