/**
 * The seam between the UI and wherever the game actually runs.
 *
 * The UI only ever talks to a `GameClient`. There are two implementations: `RemoteGameClient`
 * (a WebSocket to the room server, the default) and the in-memory, dev-only `LocalGameClient`.
 * Everything crossing this boundary is plain JSON-safe data.
 */

import type { Action, ErrorCode, GameEvent, GameView } from '@five-kingdoms/engine';
import type { EmoteId } from '@five-kingdoms/protocol';

export type { EmoteId };

/** Who the player is on this device (persisted locally). */
export interface Profile {
  name: string;
  avatar: string;
}

/** One person in a room, as shown in the lobby and around the table. */
export interface RoomPlayer {
  id: string;
  name: string;
  avatar: string;
  ready: boolean;
  isHost: boolean;
  /** False while the player's socket is down ("away"). */
  connected: boolean;
  /** True while the host has chosen to auto-play this player's turns. */
  skipped: boolean;
}

/** Set while the game is paused waiting for away players. */
export interface PauseState {
  /** Ids of the players the table is waiting for. */
  awayIds: string[];
  /** Epoch ms (server clock) when the grace period ends. */
  deadline: number;
  /** True once the deadline has passed; the host may then wait longer or skip. */
  expired: boolean;
}

export interface RoomSettings {
  /** Seats at the table, 2 to 7. */
  maxSeats: number;
}

export type RoomPhase = 'lobby' | 'inGame';

/** Lobby-level state of the room the client is in. */
export interface RoomState {
  code: string;
  /** The seat id that belongs to this client. Matches `GameView.viewerId`. */
  selfId: string;
  hostId: string;
  phase: RoomPhase;
  settings: RoomSettings;
  players: RoomPlayer[];
  /** Non-null while play is paused for an away player. */
  pause: PauseState | null;
  /** Ids of players who already pressed Continue on the round-end scoreboard. */
  continuedIds: string[];
}

/** Whether the client's link to the server is up. The local harness is always `online`. */
export type ConnectionState = 'online' | 'reconnecting';

export interface EmoteEvent {
  playerId: string;
  emote: EmoteId;
}

/** Errors the client can surface: engine rejections plus room-level problems. */
export type RoomErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NOT_HOST'
  | 'NOT_IN_ROOM'
  | 'NOT_READY'
  | 'NOT_ENOUGH_PLAYERS'
  | 'BAD_SETTINGS'
  | 'WRONG_ROOM_PHASE'
  | 'ROOM_STARTED'
  | 'BAD_TOKEN'
  | 'PROTOCOL_VERSION'
  | 'PAUSED'
  | 'RATE_LIMITED'
  | 'NO_SUCH_SEAT'
  | 'BAD_MESSAGE'
  /** The server could not be reached, or the connection dropped. */
  | 'NETWORK'
  /** Another tab or device took over this seat. */
  | 'REPLACED';

export interface ClientError {
  code: ErrorCode | RoomErrorCode;
  message: string;
}

/** Call to stop listening. */
export type Unsubscribe = () => void;

/**
 * Subscriptions replay the latest value immediately (if there is one), so a component that
 * subscribes late still sees current state. Listeners are called synchronously, in order.
 */
export interface GameClient {
  // ---- room lifecycle (each returns once the request was accepted or rejected)
  createRoom(profile: Profile, settings?: Partial<RoomSettings>): Promise<void>;
  joinRoom(code: string, profile: Profile): Promise<void>;
  /** Leave the room (or end the game) and return to having no room. */
  leave(): Promise<void>;

  // ---- lobby
  setReady(ready: boolean): Promise<void>;
  /** Host only. */
  updateSettings(settings: Partial<RoomSettings>): Promise<void>;
  /** Host only; needs 2+ players, all ready. */
  start(): Promise<void>;

  // ---- game
  /** Sends a game action for the local seat (draw, discard, goOut, finalTurnLayDown). */
  sendAction(action: Exclude<Action, { type: 'startNextRound' }>): Promise<void>;
  /** Acknowledges the round-end scoreboard; the next round starts once the room is ready. */
  continueRound(): Promise<void>;
  /** After the game ends: back to the lobby with the same room and seats, scores reset. */
  rematch(): Promise<void>;
  sendEmote(emote: EmoteId): Promise<void>;
  /** Host only, after an away player's grace period ends: wait 60s more, or auto-play their turns. */
  hostDecision(playerId: string, decision: 'wait' | 'skip'): Promise<void>;

  // ---- subscriptions
  onRoom(listener: (room: RoomState | null) => void): Unsubscribe;
  /** The redacted `viewFor` output for this seat; null when no game is running. */
  onView(listener: (view: GameView | null) => void): Unsubscribe;
  /** Redacted engine events, in order, one batch per accepted action. No replay on subscribe. */
  onEvents(listener: (events: GameEvent[]) => void): Unsubscribe;
  onEmote(listener: (emote: EmoteEvent) => void): Unsubscribe;
  onError(listener: (error: ClientError) => void): Unsubscribe;
  /** Link state to the server; replays the current value on subscribe. */
  onConnection(listener: (state: ConnectionState) => void): Unsubscribe;
}

/** Characters used in room codes: no 0/O, 1/I or L to avoid mix-ups. Matches the server. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;

/** Upper-cases and strips anything that cannot be in a room code. */
export function normalizeRoomCode(input: string): string {
  return [...input.toUpperCase()].filter((ch) => ROOM_CODE_ALPHABET.includes(ch)).join('');
}

export function isValidRoomCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH && normalizeRoomCode(code) === code;
}
