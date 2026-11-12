import { describe, expect, it } from 'vitest';
import { applyAction, redactEvents, viewFor, type GameState } from '../src';
import { cards, ids, must, rigged } from './helpers';

/** p0 to move, hands as given, p0 draws `4d` from stock first. */
const drawStock = (s: GameState, who: string) => must(s, who, { type: 'drawFromStock' });

describe('basic turn', () => {
  it('draws one card then discards one', () => {
    const s0 = rigged({ hands: ['5h 6h 7h', '3c 4c 9d'], round: 1 });
    // dealer seat 0, so p1 moves first
    expect(s0.currentIndex).toBe(1);
    const drew = drawStock(s0, 'p1');
    expect(drew.state.players[1]?.hand).toHaveLength(4);
    const top = drew.state.players[1]?.hand[3];
    expect(top?.id).toBe(s0.drawPile.at(-1)?.id);
    const disc = must(drew.state, 'p1', { type: 'discard', cardId: top?.id ?? -1 });
    expect(disc.state.players[1]?.hand).toHaveLength(3);
    expect(disc.state.discardPile.at(-1)?.id).toBe(top?.id);
    expect(disc.state.currentIndex).toBe(0);
  });

  it('draws the top discard', () => {
    const s0 = rigged({ hands: ['5h 6h 7h', '3c 4c 9d'], discard: '8d' });
    const top = s0.discardPile.at(-1);
    const r = must(s0, 'p1', { type: 'drawFromDiscard' });
    expect(r.state.players[1]?.hand.at(-1)?.id).toBe(top?.id);
    expect(r.state.discardPile).toHaveLength(0);
  });

  it('rejects wrong player, wrong phase, and cards not in hand', () => {
    const s0 = rigged({ hands: ['5h 6h 7h', '3c 4c 9d'] });
    expect(applyAction(s0, 'p0', { type: 'drawFromStock' })).toMatchObject({
      error: { code: 'NOT_YOUR_TURN' },
    });
    expect(applyAction(s0, 'zz', { type: 'drawFromStock' })).toMatchObject({
      error: { code: 'UNKNOWN_PLAYER' },
    });
    expect(applyAction(s0, 'p1', { type: 'discard', cardId: 1 })).toMatchObject({
      error: { code: 'WRONG_PHASE' },
    });
    const drew = drawStock(s0, 'p1').state;
    expect(applyAction(drew, 'p1', { type: 'drawFromStock' })).toMatchObject({
      error: { code: 'WRONG_PHASE' },
    });
    expect(applyAction(drew, 'p1', { type: 'discard', cardId: 99999 })).toMatchObject({
      error: { code: 'CARD_NOT_IN_HAND' },
    });
    expect(applyAction(drew, 'p0', { type: 'discard', cardId: 1 })).toMatchObject({
      error: { code: 'NOT_YOUR_TURN' },
    });
    expect(applyAction(drew, 'p1', { type: 'bogus' } as never)).toMatchObject({
      error: { code: 'INVALID_ACTION' },
    });
  });

  it('does not mutate the input state', () => {
    const s0 = rigged({ hands: ['5h 6h 7h', '3c 4c 9d'] });
    const before = JSON.stringify(s0);
    drawStock(s0, 'p1');
    expect(JSON.stringify(s0)).toBe(before);
  });
});

describe('discarding a card just drawn from the discard pile', () => {
  it('is rejected by default with CANNOT_DISCARD_DRAWN_DISCARD', () => {
    const s0 = rigged({ hands: ['5h 6h 7h', '3c 4c 9d'], discard: '8d' });
    const drew = must(s0, 'p1', { type: 'drawFromDiscard' }).state;
    const drawnId = drew.players[1]?.hand.at(-1)?.id ?? -1;
    expect(applyAction(drew, 'p1', { type: 'discard', cardId: drawnId })).toMatchObject({
      ok: false,
      error: { code: 'CANNOT_DISCARD_DRAWN_DISCARD' },
    });
    // other cards are fine
    const other = drew.players[1]?.hand[0]?.id ?? -1;
    expect(applyAction(drew, 'p1', { type: 'discard', cardId: other }).ok).toBe(true);
  });

  it('also applies to goOut / final lay-down discards', () => {
    const s0 = rigged({ hands: ['5h 6h 7h', '5d 6d 7d'], discard: '8d' });
    const drew = must(s0, 'p1', { type: 'drawFromDiscard' }).state;
    const hand = drew.players[1]?.hand ?? [];
    const drawn = hand[3];
    const melded = [ids(hand.slice(0, 3))];
    expect(
      applyAction(drew, 'p1', { type: 'goOut', melds: melded, discardCardId: drawn?.id ?? -1 }),
    ).toMatchObject({
      error: { code: 'CANNOT_DISCARD_DRAWN_DISCARD' },
    });
  });

  it('allows discarding a card drawn from the stock', () => {
    const s0 = rigged({ hands: ['5h 6h 7h', '3c 4c 9d'] });
    const drew = drawStock(s0, 'p1').state;
    const drawnId = drew.players[1]?.hand.at(-1)?.id ?? -1;
    expect(applyAction(drew, 'p1', { type: 'discard', cardId: drawnId }).ok).toBe(true);
  });

  it('can be switched off by the rules flag', () => {
    const s0 = rigged({
      hands: ['5h 6h 7h', '3c 4c 9d'],
      discard: '8d',
      rules: { forbidDiscardingDrawnDiscard: false },
    });
    const drew = must(s0, 'p1', { type: 'drawFromDiscard' }).state;
    const drawnId = drew.players[1]?.hand.at(-1)?.id ?? -1;
    expect(applyAction(drew, 'p1', { type: 'discard', cardId: drawnId }).ok).toBe(true);
  });
});

describe('going out', () => {
  // round 1: wild = 3. p1 acts first.
  it('goes out on the first turn of a round', () => {
    const s0 = rigged({ hands: ['9h 9d Kc', '5h 6h 7h'], stock: '8h' });
    const drew = drawStock(s0, 'p1').state; // hand: 5h 6h 7h 8h
    const hand = drew.players[1]?.hand ?? [];
    const out = must(drew, 'p1', {
      type: 'goOut',
      melds: [ids(hand.slice(0, 3))],
      discardCardId: hand[3]?.id ?? -1,
    });
    expect(out.state.outPlayerId).toBe('p1');
    expect(out.state.players[1]?.hand).toHaveLength(0);
    expect(out.state.players[1]?.melds).toHaveLength(1);
    expect(out.state.finalTurnQueue).toEqual(['p0']);
    expect(out.state.currentIndex).toBe(0);
    expect(out.events[0]).toMatchObject({ type: 'wentOut', playerId: 'p1' });
  });

  it('rejects invalid melds, uncovered cards, foreign cards and duplicates', () => {
    const s0 = rigged({ hands: ['9h 9d Kc', '5h 6h 7h'], stock: '8h' });
    const hand = drawStock(s0, 'p1').state;
    const h = hand.players[1]?.hand ?? [];
    const go = (melds: number[][], discardCardId: number) =>
      applyAction(hand, 'p1', { type: 'goOut', melds, discardCardId });
    expect(go([ids([h[0]!, h[1]!, h[3]!])], h[2]!.id)).toMatchObject({
      error: { code: 'INVALID_MELD' },
    }); // 5 6 8
    expect(go([ids([h[0]!, h[1]!])], h[2]!.id)).toMatchObject({ error: { code: 'INVALID_MELD' } });
    expect(go([ids([h[0]!, h[1]!, h[2]!])], h[2]!.id)).toMatchObject({
      error: { code: 'DUPLICATE_CARD' },
    });
    expect(go([ids([h[0]!, h[0]!, h[1]!])], h[3]!.id)).toMatchObject({
      error: { code: 'DUPLICATE_CARD' },
    });
    expect(go([[h[0]!.id, h[1]!.id, 424242]], h[3]!.id)).toMatchObject({
      error: { code: 'CARD_NOT_IN_HAND' },
    });
    expect(go([ids([h[0]!, h[1]!, h[2]!])], 424242)).toMatchObject({
      error: { code: 'CARD_NOT_IN_HAND' },
    });
    expect(go([], h[3]!.id)).toMatchObject({ error: { code: 'HAND_NOT_COVERED' } });
    expect(go([ids([h[1]!, h[2]!, h[3]!])], h[0]!.id)).toMatchObject({ ok: true });
    expect(applyAction(hand, 'p0', { type: 'goOut', melds: [], discardCardId: 1 })).toMatchObject({
      error: { code: 'NOT_YOUR_TURN' },
    });
    expect(
      applyAction(hand, 'p1', { type: 'finalTurnLayDown', melds: [], discardCardId: h[0]!.id }),
    ).toMatchObject({ error: { code: 'WRONG_PHASE' } });
  });

  it('cannot go out before drawing', () => {
    const s0 = rigged({ hands: ['9h 9d Kc', '5h 6h 7h'] });
    expect(applyAction(s0, 'p1', { type: 'goOut', melds: [], discardCardId: 1 })).toMatchObject({
      error: { code: 'WRONG_PHASE' },
    });
  });
});

describe('final turns and scoring', () => {
  it('gives each other player exactly one turn, then scores; out player scores 0', () => {
    // 3 players, round 1 (wild 3), p0 dealer, p1 first.
    let s = rigged({
      hands: ['Kc 9d 9h', '5h 6h 7h', '4s JK 10d'],
      stock: '8h 4c 4d 5c 5d',
      discard: '9s',
    });
    s = drawStock(s, 'p1').state;
    let hand = s.players[1]?.hand ?? [];
    s = must(s, 'p1', {
      type: 'goOut',
      melds: [ids(hand.slice(0, 3))],
      discardCardId: hand[3]?.id ?? -1,
    }).state;
    expect(s.currentIndex).toBe(2);

    // p2 (next clockwise) final turn: draws, lays nothing, discards.
    s = drawStock(s, 'p2').state;
    expect(
      applyAction(s, 'p2', { type: 'discard', cardId: s.players[2]?.hand[0]?.id ?? -1 }),
    ).toMatchObject({ error: { code: 'WRONG_PHASE' } });
    s = must(s, 'p2', {
      type: 'finalTurnLayDown',
      melds: [],
      discardCardId: s.players[2]?.hand[0]?.id ?? -1,
    }).state; // discards 4s
    expect(s.phase).toBe('awaitingDraw');
    expect(s.currentIndex).toBe(0);

    // p0 final turn: draw 4d... hand Kc 9d 9h + drawn; lay down nothing valid -> discard Kc.
    s = drawStock(s, 'p0').state;
    hand = s.players[0]?.hand ?? [];
    const r = must(s, 'p0', {
      type: 'finalTurnLayDown',
      melds: [],
      discardCardId: hand[0]?.id ?? -1,
    });
    expect(r.state.phase).toBe('roundOver');
    const scored = r.events.find((e) => e.type === 'roundScored');
    expect(scored).toBeDefined();
    const players = r.state.players;
    expect(players[1]?.score).toBe(0);
    expect(players[1]?.roundScores).toEqual([0]);
    expect(players.map((p) => p.score)).toEqual(players.map((p) => p.roundScores[0]));
    // p2 discarded 4s and kept JK 10d plus the drawn 5c
    expect(players[2]?.score).toBe(50 + 10 + 5);
    // p0 kept 9d 9h and the drawn 4d (no melds laid down), discarding Kc
    expect(players[0]?.score).toBe(9 + 9 + 4);
  });

  it('lets final-turn players lay down melds so only the remainder scores', () => {
    // round 2: 4 cards each, wild = 4. p1 moves first and draws 8h (stock top is last).
    let s = rigged({
      hands: ['9h 9d 9c Kc', '5h 6h 7h 8h'],
      stock: '10c 8h',
      discard: 'Qs',
      round: 2,
    });
    s = drawStock(s, 'p1').state;
    const h = s.players[1]?.hand ?? [];
    s = must(s, 'p1', {
      type: 'goOut',
      melds: [ids(h.slice(0, 4))],
      discardCardId: h[4]?.id ?? -1,
    }).state;
    s = drawStock(s, 'p0').state;
    const d = s.players[0]?.hand ?? [];
    const r = must(s, 'p0', {
      type: 'finalTurnLayDown',
      melds: [ids(d.slice(0, 3))],
      discardCardId: d[4]?.id ?? -1,
    });
    expect(r.state.players[0]?.melds).toHaveLength(1);
    expect(r.state.players[0]?.score).toBe(13); // only the king is left
    expect(r.state.players[1]?.score).toBe(0);
  });

  it('scores wild-rank cards at 20, jokers at 50, J/Q/K at 11/12/13', () => {
    // round 5: wild = 7. p1 goes out; p0 holds 7h(20) JK(50) Jd(11) Qc(12) Ks(13).
    let s = rigged({
      hands: ['7h JK Jd Qc Ks', '3h 3d 3c 4h 4d 4c'],
      stock: '5h 9s',
      discard: '8s',
      round: 5,
    });
    s = {
      ...s,
      players: s.players.map((p, i) => (i === 1 ? { ...p, hand: cards('3h 3d 3c 4h 4d') } : p)),
    };
    s = drawStock(s, 'p1').state; // draws 9s -> 3h 3d 3c 4h 4d 9s ... hand size 6
    const h = s.players[1]?.hand ?? [];
    expect(h).toHaveLength(6);
    // 3h 3d 3c (book), 4h 4d + 9s: not a meld -> cannot go out; fake a clean hand
    s = {
      ...s,
      players: s.players.map((p, i) =>
        i === 1 ? { ...p, hand: cards('3h 3d 3c 4h 4d 4c 9s') } : p,
      ),
    };
    const hh = s.players[1]?.hand ?? [];
    s = must(s, 'p1', {
      type: 'goOut',
      melds: [ids(hh.slice(0, 3)), ids(hh.slice(3, 6))],
      discardCardId: hh[6]?.id ?? -1,
    }).state;
    s = drawStock(s, 'p0').state;
    const d = s.players[0]?.hand ?? [];
    const r = must(s, 'p0', {
      type: 'finalTurnLayDown',
      melds: [],
      discardCardId: d.at(-1)?.id ?? -1,
    }); // discard drawn 5h
    expect(r.state.players[0]?.score).toBe(20 + 50 + 11 + 12 + 13);
    expect(r.state.players[1]?.score).toBe(0);
  });
});

describe('reshuffle when the draw pile empties', () => {
  it('reshuffles the discard pile except its top card', () => {
    const s0 = rigged({ hands: ['5h 6h 7h', '3c 4c 9d'], stock: '', discard: '8d 9d 10d Jd' });
    const r = must(s0, 'p1', { type: 'drawFromStock' });
    expect(r.events[0]).toMatchObject({ type: 'reshuffled', count: 3 });
    expect(r.state.discardPile).toHaveLength(1);
    expect(r.state.discardPile[0]?.rank).toBe(11);
    expect(r.state.drawPile).toHaveLength(2); // 3 reshuffled, one drawn
    expect(r.state.players[1]?.hand).toHaveLength(4);
    const again = must(s0, 'p1', { type: 'drawFromStock' });
    expect(again.state).toEqual(r.state); // deterministic
  });

  it('errors when nothing can be reshuffled or the rule is off', () => {
    const lone = rigged({ hands: ['5h 6h 7h', '3c 4c 9d'], stock: '', discard: '8d' });
    expect(applyAction(lone, 'p1', { type: 'drawFromStock' })).toMatchObject({
      error: { code: 'STOCK_EMPTY' },
    });
    const off = rigged({
      hands: ['5h 6h 7h', '3c 4c 9d'],
      stock: '',
      discard: '8d 9d',
      rules: { reshuffleDiscardWhenStockEmpty: false },
    });
    expect(applyAction(off, 'p1', { type: 'drawFromStock' })).toMatchObject({
      error: { code: 'STOCK_EMPTY' },
    });
    expect(applyAction(off, 'p1', { type: 'drawFromDiscard' }).ok).toBe(true);
  });
});

describe('viewFor and event redaction', () => {
  it('never exposes other hands', () => {
    const s = rigged({ hands: ['5h 6h 7h', '3c 4c 9d', '10s 10d Kd'] });
    const v = viewFor(s, 'p1');
    expect(v.hand.map((c) => c.id)).toEqual(ids(s.players[1]?.hand ?? []));
    expect(v.players.map((p) => p.handCount)).toEqual([3, 3, 3]);
    const json = JSON.stringify(v);
    for (const other of [s.players[0], s.players[2]]) {
      for (const c of other?.hand ?? []) expect(json).not.toContain(`"id":${c.id},`);
    }
    expect(v.discardTop?.id).toBe(s.discardPile.at(-1)?.id);
    expect(v.drawPileCount).toBe(s.drawPile.length);
    expect(v.wildRank).toBe(3);
    expect(v.currentPlayerId).toBe('p1');
    expect(viewFor(s, 'nobody').hand).toEqual([]);
  });

  it('hides dealt cards and stock draws from other players', () => {
    const s0 = rigged({ hands: ['5h 6h 7h', '3c 4c 9d'] });
    const r = drawStock(s0, 'p1');
    const mine = redactEvents(r.events, 'p1');
    const theirs = redactEvents(r.events, 'p0');
    expect(mine[0]).toMatchObject({ type: 'drew', card: { id: s0.drawPile.at(-1)?.id } });
    expect(theirs[0]).toEqual({ type: 'drew', playerId: 'p1', source: 'stock' });
    // discard draws are public
    const d = must(rigged({ hands: ['5h 6h 7h', '3c 4c 9d'], discard: '8d' }), 'p1', {
      type: 'drawFromDiscard',
    });
    expect(redactEvents(d.events, 'p0')[0]).toMatchObject({ card: { rank: 8 } });
  });
});
