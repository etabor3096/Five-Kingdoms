/** The canned emotes a player can broadcast to the table. */
export const EMOTE_IDS = [
  'thumbsUp',
  'clap',
  'laugh',
  'wow',
  'cry',
  'angry',
  'thinking',
  'hurry',
] as const;

export type EmoteId = (typeof EMOTE_IDS)[number];

/** Type guard for emote ids received over the wire. */
export function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === 'string' && (EMOTE_IDS as readonly string[]).includes(value);
}
