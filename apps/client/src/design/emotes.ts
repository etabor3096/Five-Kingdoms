/**
 * Display data for the quick emotes. The ids come from the protocol (`EMOTE_IDS`), which is
 * the single source of truth; this file only maps each id to a glyph and a label.
 */

import type { EmoteId } from '@five-kingdoms/protocol';

export const EMOTES: Record<EmoteId, { glyph: string; label: string }> = {
  thumbsUp: { glyph: '👍', label: 'Nice!' },
  clap: { glyph: '👏', label: 'Well played' },
  laugh: { glyph: '😂', label: 'Ha ha' },
  wow: { glyph: '😮', label: 'Wow' },
  cry: { glyph: '😢', label: 'Oh no' },
  angry: { glyph: '😤', label: 'Grr' },
  thinking: { glyph: '🤔', label: 'Hmm…' },
  hurry: { glyph: '⏳', label: 'Hurry up' },
};
