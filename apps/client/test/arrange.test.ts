import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from '@five-kingdoms/engine';
import {
  checkDraft,
  draftFromPlan,
  draftToAction,
  moveCard,
  type ArrangeDraft,
} from '../src/arrange/model';
import { planFinalTurn, planGoOut } from '../src/game/plans';

let nextId = 100;
const c = (rank: Rank, suit: Suit = 'stars'): Card => ({ id: nextId++, suit, rank });

describe('arrange draft', () => {
  const hand = [c(5, 'stars'), c(5, 'hearts'), c(5, 'clubs'), c(13, 'spades')];

  it('pre-fills from the solver and is valid to go out', () => {
    const plan = planGoOut(hand, 3)!;
    const draft = draftFromPlan(hand, plan);
    expect(draft.melds).toHaveLength(1);
    expect(draft.rest).toHaveLength(0);
    expect(checkDraft(draft, 3, 'goOut', null).ok).toBe(true);
    const action = draftToAction(draft, 'goOut');
    expect(action.type).toBe('goOut');
    expect(action.discardCardId).toBe(plan.discard.id);
  });

  it('moving a card out of a meld breaks it and blocks going out', () => {
    const draft = draftFromPlan(hand, planGoOut(hand, 3)!);
    const moved = moveCard(draft, draft.melds[0]![0]!.id, { kind: 'rest' });
    const check = checkDraft(moved, 3, 'goOut', null);
    expect(check.ok).toBe(false);
    expect(check.meldProblems[0]).not.toBeNull();
  });

  it('allows leftovers on a final turn', () => {
    const extra = [...hand, c(4, 'diamonds')];
    const draft = draftFromPlan(extra, planFinalTurn(extra, 3));
    expect(draft.rest).toHaveLength(1);
    const check = checkDraft(draft, 3, 'finalTurn', null);
    expect(check.ok).toBe(true);
    expect(draftToAction(draft, 'finalTurn').type).toBe('finalTurnLayDown');
  });

  it('drops empty melds, swaps the discard and starts new melds', () => {
    const draft: ArrangeDraft = { melds: [[hand[0]!]], rest: [hand[1]!], discard: hand[2]! };
    const a = moveCard(draft, hand[0]!.id, { kind: 'newMeld' });
    expect(a.melds).toHaveLength(1);
    const b = moveCard(draft, hand[1]!.id, { kind: 'discard' });
    expect(b.discard?.id).toBe(hand[1]!.id);
    expect(b.rest.map((x) => x.id)).toEqual([hand[2]!.id]);
    const d = moveCard(draft, hand[0]!.id, { kind: 'rest' });
    expect(d.melds).toHaveLength(0);
  });

  it('rejects a banned or missing discard', () => {
    const draft = draftFromPlan(hand, planGoOut(hand, 3)!);
    expect(checkDraft(draft, 3, 'goOut', draft.discard!.id).ok).toBe(false);
    expect(checkDraft({ ...draft, discard: null }, 3, 'goOut', null).ok).toBe(false);
    expect(() => draftToAction({ ...draft, discard: null }, 'goOut')).toThrow();
  });

  it('ignores unknown card ids', () => {
    const draft = draftFromPlan(hand, planGoOut(hand, 3)!);
    expect(moveCard(draft, 99999, { kind: 'rest' })).toBe(draft);
  });
});
