/**
 * The seam between the UI and wherever the game actually runs.
 *
 * The UI only ever talks to a `GameClient`. Today the one implementation is the in-memory,
 * dev-only `LocalGameClient`; a later task adds a WebSocket client with the same shape.
 * Everything crossing this boundary is plain JSON-safe data.
 */

import type { Action, ErrorCode, GameEvent, GameView } from '@five-kingdoms/engine';

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
  connected: boolean;
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
}

/** The eight quick emotes. */
export const EMOTE_IDS = ['nice', 'haha', 'wow', 'grr', 'hmm', 'clap', 'oops', 'hurry'] as const;
export type EmoteId = (typeof EMOTE_IDS)[number];

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
  | 'WRONG_ROOM_PHASE';

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

  // ---- subscriptions
  onRoom(listener: (room: RoomState | null) => void): Unsubscribe;
  /** The redacted `viewFor` output for this seat; null when no game is running. */
  onView(listener: (view: GameView | null) => void): Unsubscribe;
  /** Redacted engine events, in order, one batch per accepted action. No replay on subscribe. */
  onEvents(listener: (events: GameEvent[]) => void): Unsubscribe;
  onEmote(listener: (emote: EmoteEvent) => void): Unsubscribe;
  onError(listener: (error: ClientError) => void): Unsubscribe;
}

/** Characters used in room codes: no 0/O or 1/I to avoid mix-ups. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

/** Upper-cases and strips anything that cannot be in a room code. */
export function normalizeRoomCode(input: string): string {
  return [...input.toUpperCase()].filter((ch) => ROOM_CODE_ALPHABET.includes(ch)).join('');
}

export function isValidRoomCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH && normalizeRoomCode(code) === code;
}
