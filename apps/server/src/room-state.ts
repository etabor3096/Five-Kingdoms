/** The room's persisted shape and the pure helpers that read it. */

import type { PauseInfo, PlayerInfo, RoomInfo, RoundScoredEvent } from '@five-kingdoms/protocol';

export interface StoredPlayer {
  seat: number;
  name: string;
  avatar: string;
  ready: boolean;
  /** Auto-played by the server until the player returns. */
  skipped: boolean;
  /** SHA-256 of the rejoin token. The token itself is never stored. */
  tokenHash: string;
}

/**
 * The optional turn timer's clock for one turn. While the game is paused `deadline` is `null`
 * and `remainingMs` holds what was left, so the turn resumes with the same time.
 */
export interface TurnClock {
  /** Identifies the turn (`turnKey`), so a new turn gets a fresh clock. */
  key: string;
  /** Epoch ms when the turn is auto-played, or `null` while paused. */
  deadline: number | null;
  /** Time left when the clock last stopped (the full turn length for a new turn). */
  remainingMs: number;
}

export interface StoredPause {
  deadline: number;
  expired: boolean;
}

/** Everything about a room except the game state and the alarm schedule. */
export interface RoomState {
  code: string;
  status: 'lobby' | 'game';
  hostSeat: number;
  maxSeats: number;
  /** Host setting: auto-play turns that take too long. Optional: older stored rooms lack it. */
  turnTimer?: boolean;
  /** The running turn's clock, when the turn timer is on and someone is on the clock. */
  turnClock?: TurnClock | null;
  players: StoredPlayer[];
  /** Seats that acknowledged the current round-end scoreboard. */
  continued: number[];
  pause: StoredPause | null;
  /** Bumped on every accepted game change; clients use it to spot gaps. */
  version: number;
  /**
   * The newest `roundScored` event, kept so a client that reconnects at the scoreboard can
   * still show the leftover cards. Cleared when the next round starts or on rematch.
   * Optional because rooms stored before this field existed lack it.
   */
  lastRoundScored?: RoundScoredEvent | null;
}

/** The engine player id for a seat. Seats are dense (0..n-1), so seat = engine index. */
export const playerIdForSeat = (seat: number): string => `p${seat}`;

/** A fresh lobby with no players. */
export function newRoomState(code: string, maxSeats = 7): RoomState {
  return {
    code,
    status: 'lobby',
    hostSeat: 0,
    maxSeats,
    turnTimer: false,
    turnClock: null,
    players: [],
    continued: [],
    pause: null,
    version: 0,
    lastRoundScored: null,
  };
}

/** Names one turn. No player has two turns in a row within a round, so round + seat is enough. */
export const turnKey = (round: number, currentIndex: number): string => `${round}:${currentIndex}`;

/**
 * The turn clock after a change, given whether the game is paused. Pure.
 *
 * - A new turn (`key` differs) starts with the full `turnMs`.
 * - Pausing stops the clock and remembers what was left; resuming restarts it from there.
 */
export function advanceTurnClock(
  clock: TurnClock | null,
  key: string,
  paused: boolean,
  now: number,
  turnMs: number,
): TurnClock {
  const current: TurnClock =
    clock && clock.key === key ? clock : { key, deadline: null, remainingMs: turnMs };
  if (paused) {
    if (current.deadline === null) return current;
    return { key, deadline: null, remainingMs: Math.max(0, current.deadline - now) };
  }
  if (current.deadline !== null) return current;
  return { key, deadline: now + current.remainingMs, remainingMs: current.remainingMs };
}

/** Next host: the nearest connected seat after the old host, wrapping. `null` if none. */
export function nextHost(
  hostSeat: number,
  seats: readonly number[],
  connected: ReadonlySet<number>,
): number | null {
  const ordered = [...seats].sort((a, b) => a - b);
  const after = ordered.filter((s) => s > hostSeat).concat(ordered.filter((s) => s < hostSeat));
  return after.find((s) => connected.has(s)) ?? null;
}

/** Builds the public room description sent to every client. */
export function toRoomInfo(
  room: RoomState,
  connected: ReadonlySet<number>,
  awaySeats: readonly number[],
): RoomInfo {
  const players: PlayerInfo[] = room.players.map((p) => ({
    seat: p.seat,
    name: p.name,
    avatar: p.avatar,
    ready: p.ready,
    connected: connected.has(p.seat),
    skipped: p.skipped,
  }));
  const pause: PauseInfo | null = room.pause
    ? { seats: [...awaySeats], deadline: room.pause.deadline, expired: room.pause.expired }
    : null;
  return {
    code: room.code,
    status: room.status,
    hostSeat: room.hostSeat,
    maxSeats: room.maxSeats,
    turnTimer: room.turnTimer ?? false,
    turnDeadline: room.turnClock?.deadline ?? null,
    players,
    continued: [...room.continued],
    pause,
  };
}
