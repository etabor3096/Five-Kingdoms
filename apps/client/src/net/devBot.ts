/**
 * DEVELOPMENT HARNESS ONLY. This is a stand-in opponent so the whole flow can be played
 * alone; it is not a product bot feature (see SDD section 2).
 *
 * Policy: take the top discard only when it lowers the leftover points, go out whenever
 * the solver says it is possible, otherwise discard the highest leftover card.
 */

import {
  findBestArrangement,
  type Action,
  type Card,
  type CardId,
  type GameState,
  type PlayerState,
  type Rank,
} from '@five-kingdoms/engine';
import { planDiscard, planFinalTurn, planGoOut } from '../game/plans';

const ids = (cards: readonly Card[]): CardId[] => cards.map((c) => c.id);

/** The card this player just took from the discard pile, which they may not discard again. */
function bannedCard(state: GameState): CardId | null {
  return state.drawnFromDiscardId;
}

/** Chooses the next action for whoever is to move in `state`. */
export function devBotAction(state: GameState): { playerId: string; action: Action } {
  const player = state.players[state.currentIndex] as PlayerState;
  const wild = state.wildRank as Rank;
  const playerId = player.id;

  if (state.phase === 'awaitingDraw') {
    const top = state.discardPile.at(-1);
    const stockEmpty = state.drawPile.length === 0 && state.discardPile.length < 2;
    const now = findBestArrangement(player.hand, wild).leftoverPoints;
    const withTop = top
      ? findBestArrangement([...player.hand, top], wild).leftoverPoints
      : Infinity;
    const useDiscard = top !== undefined && (stockEmpty || withTop < now);
    return {
      playerId,
      action: { type: useDiscard ? 'drawFromDiscard' : 'drawFromStock' },
    };
  }

  const banned = bannedCard(state);
  if (state.outPlayerId === null) {
    const out = planGoOut(player.hand, wild, banned);
    if (out) {
      return {
        playerId,
        action: { type: 'goOut', melds: out.melds.map(ids), discardCardId: out.discard.id },
      };
    }
    return {
      playerId,
      action: { type: 'discard', cardId: planDiscard(player.hand, wild, banned).id },
    };
  }

  const plan = planFinalTurn(player.hand, wild, banned);
  return {
    playerId,
    action: {
      type: 'finalTurnLayDown',
      melds: plan.melds.map(ids),
      discardCardId: plan.discard.id,
    },
  };
}
