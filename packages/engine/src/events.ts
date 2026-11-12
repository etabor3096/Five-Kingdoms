/** What happened during an action, plus per-player redaction. */

import type { Card, Rank } from './cards';

export interface RoundScoreEntry {
  playerId: string;
  points: number;
  /** Cards left unmelded (revealed at round end). */
  leftover: Card[];
}

export type GameEvent =
  | {
      type: 'roundStarted';
      round: number;
      dealerId: string;
      firstPlayerId: string;
      wildRank: Rank;
      handSize: number;
    }
  /** `cards` is only present for the player who was dealt them. */
  | { type: 'dealt'; playerId: string; count: number; cards?: Card[] }
  | { type: 'startingDiscard'; card: Card }
  | { type: 'reshuffled'; count: number }
  /** `card` is public for discard draws, hidden from others for stock draws. */
  | { type: 'drew'; playerId: string; source: 'stock' | 'discard'; card?: Card }
  | { type: 'discarded'; playerId: string; card: Card }
  | { type: 'wentOut'; playerId: string; melds: Card[][]; discard: Card }
  | { type: 'laidDown'; playerId: string; melds: Card[][]; discard: Card }
  | { type: 'roundScored'; round: number; scores: RoundScoreEntry[] }
  | { type: 'gameOver'; winnerIds: string[]; totals: { playerId: string; score: number }[] };

/** Removes information `viewerId` must not see (other players' hidden cards). */
export function redactEvent(event: GameEvent, viewerId: string | null): GameEvent {
  if (event.type === 'dealt' && event.playerId !== viewerId) {
    return { type: 'dealt', playerId: event.playerId, count: event.count };
  }
  if (event.type === 'drew' && event.source === 'stock' && event.playerId !== viewerId) {
    return { type: 'drew', playerId: event.playerId, source: 'stock' };
  }
  return event;
}

export function redactEvents(events: readonly GameEvent[], viewerId: string | null): GameEvent[] {
  return events.map((e) => redactEvent(e, viewerId));
}
