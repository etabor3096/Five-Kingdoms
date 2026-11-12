import { describe, expect, it } from 'vitest';
import { memoryStore } from '../src/storage/keyValueStore';
import {
  DEFAULT_PROFILE,
  MAX_NAME_LENGTH,
  PROFILE_KEY,
  cleanName,
  loadProfile,
  saveProfile,
} from '../src/storage/profile';

describe('profile storage', () => {
  it('returns defaults when nothing is saved', async () => {
    expect(await loadProfile(memoryStore())).toEqual(DEFAULT_PROFILE);
  });

  it('round-trips a profile', async () => {
    const store = memoryStore();
    await saveProfile(store, { name: '  Ada  Lovelace ', avatar: 'owl' });
    expect(await loadProfile(store)).toEqual({ name: 'Ada Lovelace', avatar: 'owl' });
  });

  it('survives corrupt data and unknown avatars', async () => {
    expect(await loadProfile(memoryStore({ [PROFILE_KEY]: '{nope' }))).toEqual(DEFAULT_PROFILE);
    const odd = memoryStore({ [PROFILE_KEY]: JSON.stringify({ name: 5, avatar: 'dragon' }) });
    expect(await loadProfile(odd)).toEqual(DEFAULT_PROFILE);
  });

  it('truncates long names', () => {
    expect(cleanName('x'.repeat(40))).toHaveLength(MAX_NAME_LENGTH);
  });
});
