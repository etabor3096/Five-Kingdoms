/** Display data for the eight quick emotes. */

import type { EmoteId } from '../net/GameClient';

export const EMOTES: Record<EmoteId, { glyph: string; label: string }> = {
  nice: { glyph: '👍', label: 'Nice!' },
  haha: { glyph: '😂', label: 'Ha ha' },
  wow: { glyph: '😮', label: 'Wow' },
  grr: { glyph: '😤', label: 'Grr' },
  hmm: { glyph: '🤔', label: 'Hmm…' },
  clap: { glyph: '👏', label: 'Well played' },
  oops: { glyph: '😅', label: 'Oops' },
  hurry: { glyph: '⏳', label: 'Hurry up' },
};
