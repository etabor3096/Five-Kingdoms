/** Simple test-only bot. Not part of the engine's public API. */
import {
  applyAction,
  cardPoints,
  findBestArrangement,
  type Action,
  type Card,
  type GameState,
  type PlayerState,
  type Rank,
} from '../src';

const ids = (cards: readonly Card[]): number[] => cards.map((c) => c.id);

/** Which card to give up so the rest arranges best (lowest remaining points, then highest card). */
function bestDiscard(hand: readonly Card[], wildRank: Rank, banned: number | null) {
  let best: { card: Card; rest: ReturnType<typeof findBestArrangement> } | null = null;
  for (const card of hand) {
    if (card.id === banned) continue;
    const rest = findBestArrangement(
      hand.filter((c) => c.id !== card.id),
      wildRank,
    );
    const better =
      !best ||
      rest.leftoverPoints < best.rest.leftoverPoints ||
      (rest.leftoverPoints === best.rest.leftoverPoints &&
        cardPoints(card, wildRank) > cardPoints(best.card, wildRank));
    if (better) best = { card, rest };
  }
  if (!best) throw new Error('no discard available');
  return best;
}

/** Picks the next action for whoever is to move. */
export function botAction(state: GameState): { playerId: string; action: Action } {
  const player = state.players[state.currentIndex] as PlayerState;
  const playerId = player.id;
  const wildRank = state.wildRank as Rank;

  if (state.phase === 'roundOver' || state.phase === 'awaitingStart')
    return { playerId, action: { type: 'startNextRound' } };

  if (state.phase === 'awaitingDraw') {
    const top = state.discardPile.at(-1);
    if (top) {
      // Stall guard: take the discard only if, after the discard the rules force on us,
      // the hand is strictly better than it is now. Every discard pick-up therefore lowers
      // that bot's leftover points, so two bots cannot swap cards forever.
      const now = findBestArrangement(player.hand, wildRank).leftoverPoints;
      const banned = state.rules.forbidDiscardingDrawnDiscard ? top.id : null;
      const after = bestDiscard([...player.hand, top], wildRank, banned).rest.leftoverPoints;
      if (after < now) return { playerId, action: { type: 'drawFromDiscard' } };
    }
    return { playerId, action: { type: 'drawFromStock' } };
  }

  const banned = state.rules.forbidDiscardingDrawnDiscard ? state.drawnFromDiscardId : null;
  const { card, rest } = bestDiscard(player.hand, wildRank, banned);
  const final = state.outPlayerId !== null;
  if (final) {
    return {
      playerId,
      action: { type: 'finalTurnLayDown', melds: rest.melds.map(ids), discardCardId: card.id },
    };
  }
  if (rest.leftover.length === 0) {
    return {
      playerId,
      action: { type: 'goOut', melds: rest.melds.map(ids), discardCardId: card.id },
    };
  }
  return { playerId, action: { type: 'discard', cardId: card.id } };
}

/** Plays one bot move; throws if the engine rejects it. */
export function stepBot(state: GameState) {
  const { playerId, action } = botAction(state);
  const result = applyAction(state, playerId, action);
  if (!result.ok)
    throw new Error(
      `bot move ${action.type} rejected: ${result.error.code} ${result.error.message}`,
    );
  return result;
}
