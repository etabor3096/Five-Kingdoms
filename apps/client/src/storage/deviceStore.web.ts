/**
 * Web: localStorage, falling back to memory when storage is blocked (private browsing).
 *
 * `?profile=name` in the page URL namespaces every key, so two tabs of the same browser can
 * act as two different devices (own name, own rejoin tokens). Handy for testing online play.
 */
import { memoryStore, type KeyValueStore } from './keyValueStore';

const fallback = memoryStore();

/** Prefix for this tab's keys: empty normally, `profile:<name>:` with `?profile=<name>`. */
function keyPrefix(): string {
  const search = (globalThis as { location?: { search?: string } }).location?.search ?? '';
  const profile = new URLSearchParams(search).get('profile');
  return profile ? `profile:${profile}:` : '';
}

const prefix = keyPrefix();

export const deviceStore: KeyValueStore = {
  getItem: (key) => {
    try {
      return Promise.resolve(globalThis.localStorage.getItem(prefix + key));
    } catch {
      return fallback.getItem(prefix + key);
    }
  },
  setItem: (key, value) => {
    try {
      globalThis.localStorage.setItem(prefix + key, value);
      return Promise.resolve();
    } catch {
      return fallback.setItem(prefix + key, value);
    }
  },
};
