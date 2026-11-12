/** Hand-written runtime validation for client JSON. The server never trusts the wire. */

import { isEmoteId } from './emotes';
import { MAX_MAX_SEATS, MIN_MAX_SEATS, type ClientMessage, type IntentAction } from './messages';

export type ParseResult = { ok: true; message: ClientMessage } | { ok: false; error: string };

/** Longest raw message the server will even try to parse. */
export const MAX_MESSAGE_CHARS = 8192;
export const MAX_NAME_CHARS = 20;
export const MAX_AVATAR_CHARS = 32;
const MAX_CODE_CHARS = 12;
const MAX_TOKEN_CHARS = 128;
const MAX_CARD_ID = 1000;
const MAX_MELDS = 10;
const MAX_MELD_CARDS = 30;

const fail = (error: string): ParseResult => ({ ok: false, error });
const good = (message: ClientMessage): ParseResult => ({ ok: true, message });

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isCardId = (v: unknown): v is number => isInt(v, 0, MAX_CARD_ID);

function isString(v: unknown, min: number, max: number): v is string {
  return typeof v === 'string' && v.length >= min && v.length <= max;
}

function parseMelds(v: unknown): number[][] | null {
  if (!Array.isArray(v) || v.length > MAX_MELDS) return null;
  const melds: number[][] = [];
  for (const meld of v as unknown[]) {
    if (!Array.isArray(meld) || meld.length > MAX_MELD_CARDS) return null;
    if (!(meld as unknown[]).every(isCardId)) return null;
    melds.push(meld as number[]);
  }
  return melds;
}

function parseAction(v: unknown): IntentAction | null {
  if (!isObj(v)) return null;
  switch (v.type) {
    case 'drawFromStock':
    case 'drawFromDiscard':
      return { type: v.type };
    case 'discard':
      return isCardId(v.cardId) ? { type: 'discard', cardId: v.cardId } : null;
    case 'goOut':
    case 'finalTurnLayDown': {
      const melds = parseMelds(v.melds);
      if (!melds || !isCardId(v.discardCardId)) return null;
      return { type: v.type, melds, discardCardId: v.discardCardId };
    }
    default:
      return null; // includes `startNextRound`: only the server starts rounds
  }
}

/**
 * Validates one client message. Accepts the raw JSON text or an already parsed value.
 * Unknown fields are dropped; the returned message contains only known, checked fields.
 */
export function parseClientMessage(json: unknown): ParseResult {
  let value = json;
  if (typeof json === 'string') {
    if (json.length > MAX_MESSAGE_CHARS) return fail('message too large');
    try {
      value = JSON.parse(json);
    } catch {
      return fail('not valid JSON');
    }
  }
  if (!isObj(value)) return fail('message must be an object');

  switch (value.type) {
    case 'join': {
      if (!isString(value.roomCode, 1, MAX_CODE_CHARS)) return fail('bad roomCode');
      if (typeof value.name !== 'string') return fail('bad name');
      const name = value.name.trim();
      if (name.length < 1 || name.length > MAX_NAME_CHARS) return fail('bad name length');
      if (!isString(value.avatar, 1, MAX_AVATAR_CHARS)) return fail('bad avatar');
      if (!isInt(value.protocolVersion, 0, 1_000_000)) return fail('bad protocolVersion');
      const base = {
        type: 'join' as const,
        roomCode: value.roomCode.toUpperCase(),
        name,
        avatar: value.avatar,
        protocolVersion: value.protocolVersion,
      };
      if (value.rejoinToken === undefined) return good(base);
      if (!isString(value.rejoinToken, 1, MAX_TOKEN_CHARS)) return fail('bad rejoinToken');
      return good({ ...base, rejoinToken: value.rejoinToken });
    }
    case 'ready':
    case 'unready':
    case 'start':
    case 'continue':
    case 'rematch':
      return good({ type: value.type });
    case 'settings':
      if (!isInt(value.maxSeats, MIN_MAX_SEATS, MAX_MAX_SEATS)) return fail('bad maxSeats');
      return good({ type: 'settings', maxSeats: value.maxSeats });
    case 'intent': {
      const action = parseAction(value.action);
      if (!action) return fail('bad action');
      if (!isInt(value.lastVersion, 0, Number.MAX_SAFE_INTEGER)) return fail('bad lastVersion');
      return good({ type: 'intent', action, lastVersion: value.lastVersion });
    }
    case 'emote':
      if (!isEmoteId(value.emoteId)) return fail('unknown emote');
      return good({ type: 'emote', emoteId: value.emoteId });
    case 'hostDecision':
      if (!isInt(value.seat, 0, MAX_MAX_SEATS - 1)) return fail('bad seat');
      if (value.decision !== 'wait' && value.decision !== 'skip') return fail('bad decision');
      return good({ type: 'hostDecision', seat: value.seat, decision: value.decision });
    default:
      return fail('unknown message type');
  }
}
