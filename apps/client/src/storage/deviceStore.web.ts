/** Web: localStorage, falling back to memory when storage is blocked (private browsing). */
import { memoryStore, type KeyValueStore } from './keyValueStore';

const fallback = memoryStore();

export const deviceStore: KeyValueStore = {
  getItem: (key) => {
    try {
      return Promise.resolve(globalThis.localStorage.getItem(key));
    } catch {
      return fallback.getItem(key);
    }
  },
  setItem: (key, value) => {
    try {
      globalThis.localStorage.setItem(key, value);
      return Promise.resolve();
    } catch {
      return fallback.setItem(key, value);
    }
  },
};
