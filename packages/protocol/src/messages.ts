/** Every message that crosses the WebSocket, as discriminated unions on `type`. */

import type { Action, GameEvent, GameView } from '@five-kingdoms/engine';
import type { EmoteId } from './emotes';

/** Bump when a change would break older clients. The server rejects other versions. */
export const PROTOCOL_VERSION = 1;

/** Smallest and largest number of seats the host may configure. */
export const MIN_MAX_SEATS = 2;
export const MAX_MAX_SEATS = 7;

/** Heartbeat strings. The server answers `ping` with `pong` without waking the room. */
export const PING = 'ping';
export const PONG = 'pong';

/** The engine actions a client may send. `startNextRound` is server-driven. */
export type IntentAction = Exclude<Action, { type: 'startNextRound' }>;

// ------------------------------------------------------------------ client -> server

export type ClientMessage =
  | {
      type: 'join';
      roomCode: string;
      name: string;
      avatar: string;
      rejoinToken?: string;
      protocolVersion: number;
    }
  | { type: 'ready' }
  | { type: 'unready' }
  | { type: 'settings'; maxSeats: number }
  | { type: 'start' }
  /** `lastVersion` is the newest view version the client has seen. */
  | { type: 'intent'; action: IntentAction; lastVersion: number }
  /** Acknowledges the round-end scoreboard. */
  | { type: 'continue' }
  | { type: 'emote'; emoteId: EmoteId }
  | { type: 'hostDecision'; seat: number; decision: 'wait' | 'skip' }
  | { type: 'rematch' };

export type ClientMessageType = ClientMessage['type'];

// ------------------------------------------------------------------ shared room data

/** One seat as everybody at the table sees it. */
export interface PlayerInfo {
  seat: number;
  name: string;
  avatar: string;
  ready: boolean;
  connected: boolean;
  /** True while the host has chosen to auto-play this seat's turns. */
  skipped: boolean;
}

/** Set while the game is paused because someone is away. */
export interface PauseInfo {
  /** Seats the table is waiting for. */
  seats: number[];
  /** Epoch ms when the grace period ends. */
  deadline: number;
  /** True once the deadline has passed; the host may now send `hostDecision`. */
  expired: boolean;
}

export interface RoomInfo {
  code: string;
  status: 'lobby' | 'game';
  hostSeat: number;
  maxSeats: number;
  players: PlayerInfo[];
  /** Seats that have acknowledged the current round-end scoreboard. */
  continued: number[];
  pause: PauseInfo | null;
}

export type ErrorCode =
  | 'BAD_MESSAGE'
  | 'PROTOCOL_VERSION'
  | 'ROOM_FULL'
  | 'ROOM_STARTED'
  | 'BAD_TOKEN'
  | 'NOT_JOINED'
  | 'ALREADY_JOINED'
  | 'NOT_HOST'
  | 'BAD_STATE'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_ALL_READY'
  | 'INVALID_SETTINGS'
  | 'PAUSED'
  | 'RATE_LIMITED'
  | 'NO_SUCH_SEAT'
  /** Engine rejections are forwarded with the engine's own code. */
  | 'ENGINE';

// ------------------------------------------------------------------ server -> client

export type ServerMessage =
  | {
      type: 'welcome';
      seat: number;
      /** The secret to store on the device. `null` on a rejoin: the client already holds it. */
      rejoinToken: string | null;
      room: RoomInfo;
      /** `null` while in the lobby. */
      view: GameView | null;
      version: number;
    }
  | { type: 'roomUpdate'; room: RoomInfo }
  | { type: 'events'; events: GameEvent[]; view: GameView; version: number }
  | { type: 'view'; view: GameView; version: number }
  /** `engineCode` carries the engine's error code when `code` is `ENGINE`. */
  | { type: 'error'; code: ErrorCode; message: string; engineCode?: string }
  | { type: 'presence'; seat: number; connected: boolean; deadline: number | null }
  | { type: 'emote'; seat: number; emoteId: EmoteId };

export type ServerMessageType = ServerMessage['type'];
