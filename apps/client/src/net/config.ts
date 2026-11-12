/**
 * Build-time and URL-time configuration for choosing and addressing the server.
 *
 * Expo inlines `process.env.EXPO_PUBLIC_*` at bundle time, so each variable must be read as a
 * literal `process.env.EXPO_PUBLIC_NAME` expression (no destructuring or dynamic keys).
 */

declare const process: { env: Record<string, string | undefined> };

/** Where the room server listens during local development (`wrangler dev`). */
export const DEFAULT_SERVER_URL = 'http://localhost:8787';

/** The server's HTTP base URL: `EXPO_PUBLIC_SERVER_URL`, else the local default. */
export function serverUrlFromEnv(): string {
  return process.env.EXPO_PUBLIC_SERVER_URL || DEFAULT_SERVER_URL;
}

/** Turns an `http(s)://` base URL into the matching `ws(s)://` one, without a trailing slash. */
export function toWebSocketBase(httpUrl: string): string {
  return httpUrl.replace(/\/+$/, '').replace(/^http/i, 'ws');
}

/**
 * True when the in-memory dev harness should replace the real server: either
 * `EXPO_PUBLIC_DEV_HARNESS=1` at build time, or `?dev=1` in the page URL (web only).
 */
export function wantsDevHarness(search: string | undefined = currentSearch()): boolean {
  if (process.env.EXPO_PUBLIC_DEV_HARNESS === '1') return true;
  return new URLSearchParams(search ?? '').get('dev') === '1';
}

function currentSearch(): string | undefined {
  return (globalThis as { location?: { search?: string } }).location?.search;
}
