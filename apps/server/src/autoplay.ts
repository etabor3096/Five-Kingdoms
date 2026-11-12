/** Picks moves for a seat the host has chosen to skip. Pure: no I/O, no randomness. */

import type { Action, GameState } from '@five-kingdoms/engine';

/** The player to move and the actions to try, best first. The first one the engine accepts wins. */
export interface AutoMove {
  playerId: string;
  candidates: Action[];
}

/**
 * Chooses the automatic turn step for whoever is to move, or `null` when no turn is pending.
 *
 * - Draw phase: draw from the stock; if that fails (empty and not refillable), take the discard.
 * - Discard phase: discard the card just drawn (the last card in hand). During final turns
 *   this is a lay-down with no melds. If the drawn card may not be discarded (it came from
 *   the discard pile), discard a different card instead.
 */
export function pickAutoMove(state: GameState): AutoMove | null {
  const player = state.players[state.currentIndex];
  if (!player) return null;

  if (state.phase === 'awaitingDraw') {
    return {
      playerId: player.id,
      candidates: [{ type: 'drawFromStock' }, { type: 'drawFromDiscard' }],
    };
  }
  if (state.phase !== 'awaitingDiscard') return null;

  const banned = state.rules.forbidDiscardingDrawnDiscard ? state.drawnFromDiscardId : null;
  const card = [...player.hand].reverse().find((c) => c.id !== banned);
  if (!card) return null;
  const action: Action =
    state.outPlayerId !== null
      ? { type: 'finalTurnLayDown', melds: [], discardCardId: card.id }
      : { type: 'discard', cardId: card.id };
  return { playerId: player.id, candidates: [action] };
}
