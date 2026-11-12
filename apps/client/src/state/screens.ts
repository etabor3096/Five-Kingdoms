/** Decides which screen to show from room and game state. */

import type { GameView } from '@five-kingdoms/engine';
import type { RoomState } from '../net/GameClient';

export type FlowScreen = 'menu' | 'lobby' | 'table' | 'scoreboard' | 'standings';

/**
 * Menu with no room; lobby before the game; the table during rounds; the scoreboard when a
 * round (including the last) is over; standings once the player moves on from round 11.
 */
export function selectScreen(
  room: RoomState | null,
  view: GameView | null,
  standingsOpen: boolean,
): FlowScreen {
  if (!room) return 'menu';
  if (room.phase === 'lobby' || !view) return 'lobby';
  if (view.phase === 'roundOver') return 'scoreboard';
  if (view.phase === 'gameOver') return standingsOpen ? 'standings' : 'scoreboard';
  return 'table';
}
