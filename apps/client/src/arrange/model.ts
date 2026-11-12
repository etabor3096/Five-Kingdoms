/**
 * The arrange-melds draft: which cards are in which meld, which are left over, and which one
 * is discarded. Pure data plus helpers, so the screen stays thin and the rules are testable.
 */

import {
  validateMeld,
  type Action,
  type Card,
  type CardId,
  type Rank,
} from '@five-kingdoms/engine';
import type { TurnPlan } from '../game/plans';

/** `goOut`: every card must be melded or discarded. `finalTurn`: leftovers are allowed. */
export type ArrangeMode = 'goOut' | 'finalTurn';

export interface ArrangeDraft {
  melds: Card[][];
  rest: Card[];
  discard: Card | null;
}

/** A destination for a card: an existing meld, a brand-new meld, the leftovers or the discard. */
export type Target =
  { kind: 'meld'; index: number } | { kind: 'newMeld' } | { kind: 'rest' } | { kind: 'discard' };

/** Builds the starting draft from a solver plan; every other hand card goes to the leftovers. */
export function draftFromPlan(hand: readonly Card[], plan: TurnPlan): ArrangeDraft {
  const placed = new Set<CardId>([plan.discard.id, ...plan.melds.flat().map((c) => c.id)]);
  return {
    melds: plan.melds.map((m) => [...m]),
    rest: hand.filter((c) => !placed.has(c.id)),
    discard: plan.discard,
  };
}

/** Moves one card to `target`. Empty melds are dropped; a card already discarded returns to rest. */
export function moveCard(draft: ArrangeDraft, cardId: CardId, target: Target): ArrangeDraft {
  const all = [...draft.melds.flat(), ...draft.rest, ...(draft.discard ? [draft.discard] : [])];
  const card = all.find((c) => c.id === cardId);
  if (!card) return draft;

  const melds = draft.melds.map((m) => m.filter((c) => c.id !== cardId));
  let rest = draft.rest.filter((c) => c.id !== cardId);
  let discard = draft.discard?.id === cardId ? null : draft.discard;

  switch (target.kind) {
    case 'meld':
      melds[target.index]?.push(card);
      break;
    case 'newMeld':
      melds.push([card]);
      break;
    case 'rest':
      rest = [...rest, card];
      break;
    case 'discard':
      if (discard) rest = [...rest, discard];
      discard = card;
      break;
  }
  return { melds: melds.filter((m) => m.length > 0), rest, discard };
}

export interface DraftCheck {
  /** One entry per meld: null when valid, else the reason. */
  meldProblems: (string | null)[];
  /** Problems with the draft as a whole (empty when it can be submitted). */
  problems: string[];
  ok: boolean;
}

/** Checks a draft against the engine's meld rules plus the mode's requirements. */
export function checkDraft(
  draft: ArrangeDraft,
  wildRank: Rank,
  mode: ArrangeMode,
  bannedDiscardId: CardId | null,
): DraftCheck {
  const meldProblems = draft.melds.map((m) => {
    const check = validateMeld(m, wildRank);
    return check.ok ? null : check.reason;
  });
  const problems: string[] = [];
  if (meldProblems.some((p) => p !== null)) problems.push('Fix the highlighted melds');
  if (!draft.discard) problems.push('Choose a card to discard');
  else if (draft.discard.id === bannedDiscardId) {
    problems.push('You cannot discard the card you took from the discard pile');
  }
  if (mode === 'goOut' && draft.rest.length > 0) {
    problems.push('To go out, every card must be in a meld');
  }
  return { meldProblems, problems, ok: problems.length === 0 };
}

/** Converts a valid draft into the engine action. Throws if the draft has no discard. */
export function draftToAction(
  draft: ArrangeDraft,
  mode: ArrangeMode,
): Extract<Action, { type: 'goOut' | 'finalTurnLayDown' }> {
  if (!draft.discard) throw new RangeError('Draft has no discard');
  return {
    type: mode === 'goOut' ? 'goOut' : 'finalTurnLayDown',
    melds: draft.melds.map((m) => m.map((c) => c.id)),
    discardCardId: draft.discard.id,
  };
}
