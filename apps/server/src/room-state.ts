/** The room's persisted shape and the pure helpers that read it. */

import type { PauseInfo, PlayerInfo, RoomInfo } from '@five-kingdoms/protocol';

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
  players: StoredPlayer[];
  /** Seats that acknowledged the current round-end scoreboard. */
  continued: number[];
  pause: StoredPause | null;
  /** Bumped on every accepted game change; clients use it to spot gaps. */
  version: number;
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
    players: [],
    continued: [],
    pause: null,
    version: 0,
  };
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
    players,
    continued: [...room.continued],
    pause,
  };
}
