/** Plain, JSON-safe game state plus the action and result types. */

import type { Card, CardId, Rank } from './cards';
import type { GameEvent } from './events';
import type { RulesConfig } from './rules';

export type Phase =
  /** Created, nobody dealt yet. `startNextRound` deals round 1. */
  | 'awaitingStart'
  /** Current player must draw. */
  | 'awaitingDraw'
  /** Current player has drawn and must discard / go out / lay down. */
  | 'awaitingDiscard'
  /** Round scored; `startNextRound` deals the next one. */
  | 'roundOver'
  | 'gameOver';

export interface PlayerState {
  id: string;
  name: string;
  hand: Card[];
  /** Melds laid down this round (public). Empty until going out / a final turn. */
  melds: Card[][];
  score: number;
  /** Points scored in each finished round; `score` is always its sum. */
  roundScores: number[];
}

export interface GameState {
  rules: RulesConfig;
  seed: number;
  /** Current PRNG state (advances with every shuffle). */
  rngState: number;
  /** 0 before the first deal, then 1..11. */
  round: number;
  /** Seat index of the dealer. Seats run clockwise by increasing index. */
  dealerIndex: number;
  currentIndex: number;
  phase: Phase;
  wildRank: Rank | null;
  players: PlayerState[];
  /** Top of the pile is the LAST element. */
  drawPile: Card[];
  /** Top of the pile is the LAST element. */
  discardPile: Card[];
  /** Who went out this round, once someone has. */
  outPlayerId: string | null;
  /** Players still owed a final turn, in order; the first is the current player. */
  finalTurnQueue: string[];
  /** The card the current player took from the discard pile this turn, if any. */
  drawnFromDiscardId: CardId | null;
  /** Filled when the game ends; shared on ties. */
  winnerIds: string[];
}

export type Action =
  | { type: 'drawFromStock' }
  | { type: 'drawFromDiscard' }
  | { type: 'discard'; cardId: CardId }
  | { type: 'goOut'; melds: CardId[][]; discardCardId: CardId }
  | { type: 'finalTurnLayDown'; melds: CardId[][]; discardCardId: CardId }
  | { type: 'startNextRound' };

export type ErrorCode =
  | 'UNKNOWN_PLAYER'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'INVALID_ACTION'
  | 'CARD_NOT_IN_HAND'
  | 'DUPLICATE_CARD'
  | 'INVALID_MELD'
  | 'HAND_NOT_COVERED'
  | 'STOCK_EMPTY'
  | 'CANNOT_DISCARD_DRAWN_DISCARD';

export interface ActionError {
  code: ErrorCode;
  message: string;
}

export type ActionResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: ActionError };
