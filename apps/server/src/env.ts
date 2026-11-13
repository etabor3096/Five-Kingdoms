import type { Room } from './room';

/** Worker bindings and optional tuning variables. */
export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  /** Disconnect grace period in ms. Defaults to 60 000; tests shorten it. */
  GRACE_MS?: string;
  /** Idle room lifetime after the last socket closes, in ms. Defaults to 30 minutes. */
  EXPIRY_MS?: string;
  /** Length of a timed turn in ms. Defaults to `TURN_TIMER_SECONDS`; tests shorten it. */
  TURN_MS?: string;
}

export const DEFAULT_GRACE_MS = 60_000;
export const DEFAULT_EXPIRY_MS = 30 * 60_000;

/** Reads a positive millisecond setting from an env var, falling back to `fallback`. */
export function msSetting(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && Number.isFinite(n) && n > 0 ? n : fallback;
}
