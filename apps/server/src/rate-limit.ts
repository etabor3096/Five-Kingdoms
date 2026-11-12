/** Minimal per-key rate limiter for emotes. Pure: the caller supplies the clock. */

export const EMOTE_INTERVAL_MS = 1000;

/**
 * Returns whether `key` may act at `now`, and records the action if so.
 * `last` is mutated; it maps a key (seat) to the time of its last allowed action.
 */
export function allowAction(
  last: Map<number, number>,
  key: number,
  now: number,
  intervalMs = EMOTE_INTERVAL_MS,
): boolean {
  const previous = last.get(key);
  if (previous !== undefined && now - previous < intervalMs) return false;
  last.set(key, now);
  return true;
}
