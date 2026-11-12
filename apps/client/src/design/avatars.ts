/** Avatar choices: a colour from the palette plus a glyph. Placeholder art, easy to swap. */

import { OKABE_ITO } from './tokens';

export interface AvatarDef {
  id: string;
  label: string;
  glyph: string;
  color: string;
}

export const AVATARS: readonly AvatarDef[] = [
  { id: 'fox', label: 'Fox', glyph: '🦊', color: OKABE_ITO.orange },
  { id: 'owl', label: 'Owl', glyph: '🦉', color: OKABE_ITO.blue },
  { id: 'frog', label: 'Frog', glyph: '🐸', color: OKABE_ITO.bluishGreen },
  { id: 'cat', label: 'Cat', glyph: '🐱', color: OKABE_ITO.reddishPurple },
  { id: 'bear', label: 'Bear', glyph: '🐻', color: OKABE_ITO.vermillion },
  { id: 'fish', label: 'Fish', glyph: '🐠', color: OKABE_ITO.skyBlue },
  { id: 'bee', label: 'Bee', glyph: '🐝', color: OKABE_ITO.yellow },
  { id: 'wolf', label: 'Wolf', glyph: '🐺', color: '#7a8691' },
];

export const DEFAULT_AVATAR = 'fox';

/** Looks an avatar up by id, falling back to the first one for unknown ids. */
export function avatarById(id: string): AvatarDef {
  return AVATARS.find((a) => a.id === id) ?? (AVATARS[0] as AvatarDef);
}
