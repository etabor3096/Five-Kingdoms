/** The redacted view of a game that one player is allowed to see. */

import type { Card, Rank } from './cards';
import type { Phase } from './state';
import type { GameState } from './state';

export interface PlayerView {
  id: string;
  name: string;
  handCount: number;
  melds: Card[][];
  score: number;
  roundScores: number[];
}

export interface GameView {
  viewerId: string;
  round: number;
  phase: Phase;
  wildRank: Rank | null;
  dealerId: string;
  currentPlayerId: string;
  /** Only the viewer's own cards. Empty for spectators / unknown ids. */
  hand: Card[];
  players: PlayerView[];
  discardTop: Card | null;
  drawPileCount: number;
  discardCount: number;
  outPlayerId: string | null;
  finalTurnQueue: string[];
  winnerIds: string[];
}

/** Builds what `playerId` may see: own hand, others' hand counts, public table state. */
export function viewFor(state: GameState, playerId: string): GameView {
  const me = state.players.find((p) => p.id === playerId);
  return {
    viewerId: playerId,
    round: state.round,
    phase: state.phase,
    wildRank: state.wildRank,
    dealerId: (state.players[state.dealerIndex] as { id: string }).id,
    currentPlayerId: (state.players[state.currentIndex] as { id: string }).id,
    hand: me ? [...me.hand] : [],
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      handCount: p.hand.length,
      melds: p.melds,
      score: p.score,
      roundScores: p.roundScores,
    })),
    discardTop: state.discardPile.at(-1) ?? null,
    drawPileCount: state.drawPile.length,
    discardCount: state.discardPile.length,
    outPlayerId: state.outPlayerId,
    finalTurnQueue: state.finalTurnQueue,
    winnerIds: state.winnerIds,
  };
}
