/** Ranking for the final standings: lowest total wins, ties share a rank. */

import type { PlayerView } from '@five-kingdoms/engine';

export interface RankedPlayer {
  player: PlayerView;
  /** 1-based; tied players share a rank and the next rank is skipped (1, 1, 3). */
  rank: number;
}

/** Sorts players by total score ascending and assigns competition ranks. */
export function rankPlayers(players: readonly PlayerView[]): RankedPlayer[] {
  const sorted = [...players].sort((a, b) => a.score - b.score);
  return sorted.map((player) => {
    const firstWithScore = sorted.findIndex((p) => p.score === player.score);
    return { player, rank: firstWithScore + 1 };
  });
}
