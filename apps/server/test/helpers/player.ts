/** A tiny scripted player: draws from the stock, then keeps the best arrangement. */

import { cardPoints, findBestArrangement, type Card, type GameView } from '@five-kingdoms/engine';
import type { IntentAction } from '@five-kingdoms/protocol';

const ids = (cards: readonly Card[]) => cards.map((c) => c.id);

/** The action this view's owner should play now, or `null` if it is not their turn. */
export function chooseIntent(view: GameView): IntentAction | null {
  if (view.currentPlayerId !== view.viewerId) return null;
  if (view.phase === 'awaitingDraw') return { type: 'drawFromStock' };
  if (view.phase !== 'awaitingDiscard' || view.wildRank === null) return null;

  // Give up the card that leaves the fewest points; the dearest card breaks ties.
  let best: { card: Card; rest: ReturnType<typeof findBestArrangement> } | null = null;
  for (const card of view.hand) {
    const rest = findBestArrangement(
      view.hand.filter((c) => c.id !== card.id),
      view.wildRank,
    );
    const better =
      !best ||
      rest.leftoverPoints < best.rest.leftoverPoints ||
      (rest.leftoverPoints === best.rest.leftoverPoints &&
        cardPoints(card, view.wildRank) > cardPoints(best.card, view.wildRank));
    if (better) best = { card, rest };
  }
  if (!best) return null;
  const melds = best.rest.melds.map(ids);
  if (view.outPlayerId !== null) {
    return { type: 'finalTurnLayDown', melds, discardCardId: best.card.id };
  }
  if (best.rest.leftover.length === 0) {
    return { type: 'goOut', melds, discardCardId: best.card.id };
  }
  return { type: 'discard', cardId: best.card.id };
}
