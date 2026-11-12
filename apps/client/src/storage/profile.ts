/** Loads and saves the player's name and avatar on this device. */

import { AVATARS, DEFAULT_AVATAR } from '../design/avatars';
import type { Profile } from '../net/GameClient';
import type { KeyValueStore } from './keyValueStore';

export const PROFILE_KEY = 'five-kingdoms.profile.v1';
export const MAX_NAME_LENGTH = 16;

export const DEFAULT_PROFILE: Profile = { name: '', avatar: DEFAULT_AVATAR };

/** Trims and truncates a display name. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

/** Reads the saved profile; anything missing or malformed falls back to defaults. */
export async function loadProfile(store: KeyValueStore): Promise<Profile> {
  try {
    const raw = await store.getItem(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const data = JSON.parse(raw) as Partial<Profile>;
    const avatar = AVATARS.some((a) => a.id === data.avatar)
      ? (data.avatar as string)
      : DEFAULT_AVATAR;
    return { name: typeof data.name === 'string' ? cleanName(data.name) : '', avatar };
  } catch {
    return DEFAULT_PROFILE;
  }
}

/** Saves the profile (name cleaned first). */
export async function saveProfile(store: KeyValueStore, profile: Profile): Promise<void> {
  await store.setItem(PROFILE_KEY, JSON.stringify({ ...profile, name: cleanName(profile.name) }));
}
