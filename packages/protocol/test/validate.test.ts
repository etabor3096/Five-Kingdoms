import { describe, expect, it } from 'vitest';
import { EMOTE_IDS, PROTOCOL_VERSION, parseClientMessage } from '../src';

const join = { type: 'join', roomCode: 'abc23', name: ' Ann ', avatar: 'fox', protocolVersion: 1 };

describe('parseClientMessage', () => {
  it('accepts JSON text and parsed values, normalising join', () => {
    const r = parseClientMessage(JSON.stringify(join));
    expect(r).toEqual({
      ok: true,
      message: { type: 'join', roomCode: 'ABC23', name: 'Ann', avatar: 'fox', protocolVersion: 1 },
    });
    expect(parseClientMessage(join).ok).toBe(true);
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('keeps an optional rejoin token and drops unknown fields', () => {
    const r = parseClientMessage({ ...join, rejoinToken: 'tok', extra: 1 });
    expect(r.ok && r.message).toMatchObject({ rejoinToken: 'tok' });
    expect(r.ok && 'extra' in r.message).toBe(false);
  });

  it.each([
    ['not json', '{nope'],
    ['array', '[]'],
    ['null', 'null'],
    ['number', 5],
    ['no type', {}],
    ['unknown type', { type: 'hack' }],
    ['oversized', ' '.repeat(9000)],
    ['empty name', { ...join, name: '   ' }],
    ['long name', { ...join, name: 'x'.repeat(21) }],
    ['numeric name', { ...join, name: 5 }],
    ['bad version', { ...join, protocolVersion: 1.5 }],
    ['bad token', { ...join, rejoinToken: '' }],
    ['bad code', { ...join, roomCode: '' }],
  ])('rejects malformed join: %s', (_label, input) => {
    expect(parseClientMessage(input).ok).toBe(false);
  });

  it('accepts the argument-less messages', () => {
    for (const type of ['ready', 'unready', 'start', 'continue', 'rematch']) {
      expect(parseClientMessage({ type })).toEqual({ ok: true, message: { type } });
    }
  });

  it('validates settings range', () => {
    expect(parseClientMessage({ type: 'settings', maxSeats: 2 }).ok).toBe(true);
    expect(parseClientMessage({ type: 'settings', maxSeats: 7 }).ok).toBe(true);
    for (const maxSeats of [1, 8, 3.5, '4', null]) {
      expect(parseClientMessage({ type: 'settings', maxSeats }).ok).toBe(false);
    }
  });

  it('validates the turn timer setting, alone or with max seats', () => {
    expect(parseClientMessage({ type: 'settings', turnTimer: true })).toEqual({
      ok: true,
      message: { type: 'settings', turnTimer: true },
    });
    expect(parseClientMessage({ type: 'settings', maxSeats: 4, turnTimer: false })).toEqual({
      ok: true,
      message: { type: 'settings', maxSeats: 4, turnTimer: false },
    });
    expect(parseClientMessage({ type: 'settings' }).ok).toBe(false);
    for (const turnTimer of [1, 'yes', null]) {
      expect(parseClientMessage({ type: 'settings', turnTimer }).ok).toBe(false);
    }
  });

  it('validates intents', () => {
    const ok = (action: unknown) =>
      parseClientMessage({ type: 'intent', action, lastVersion: 3 }).ok;
    expect(ok({ type: 'drawFromStock' })).toBe(true);
    expect(ok({ type: 'drawFromDiscard' })).toBe(true);
    expect(ok({ type: 'discard', cardId: 12 })).toBe(true);
    expect(ok({ type: 'goOut', melds: [[1, 2, 3]], discardCardId: 4 })).toBe(true);
    expect(ok({ type: 'finalTurnLayDown', melds: [], discardCardId: 4 })).toBe(true);
    expect(ok({ type: 'startNextRound' })).toBe(false);
    expect(ok({ type: 'discard', cardId: -1 })).toBe(false);
    expect(ok({ type: 'discard', cardId: '1' })).toBe(false);
    expect(ok({ type: 'goOut', melds: [[1, 'x']], discardCardId: 4 })).toBe(false);
    expect(ok({ type: 'goOut', melds: 'no', discardCardId: 4 })).toBe(false);
    expect(ok({ type: 'goOut', melds: [[1]] })).toBe(false);
    expect(ok(null)).toBe(false);
    expect(parseClientMessage({ type: 'intent', action: { type: 'drawFromStock' } }).ok).toBe(
      false,
    );
    expect(
      parseClientMessage({ type: 'intent', action: { type: 'drawFromStock' }, lastVersion: -1 }).ok,
    ).toBe(false);
  });

  it('rejects oversized meld lists', () => {
    const melds = Array.from({ length: 11 }, () => [1, 2, 3]);
    const action = { type: 'goOut', melds, discardCardId: 4 };
    expect(parseClientMessage({ type: 'intent', action, lastVersion: 0 }).ok).toBe(false);
  });

  it('validates emotes', () => {
    expect(EMOTE_IDS.length).toBe(8);
    for (const emoteId of EMOTE_IDS)
      expect(parseClientMessage({ type: 'emote', emoteId }).ok).toBe(true);
    expect(parseClientMessage({ type: 'emote', emoteId: 'nope' }).ok).toBe(false);
    expect(parseClientMessage({ type: 'emote' }).ok).toBe(false);
  });

  it('validates host decisions', () => {
    expect(parseClientMessage({ type: 'hostDecision', seat: 2, decision: 'skip' }).ok).toBe(true);
    expect(parseClientMessage({ type: 'hostDecision', seat: 2, decision: 'bot' }).ok).toBe(false);
    expect(parseClientMessage({ type: 'hostDecision', seat: 9, decision: 'wait' }).ok).toBe(false);
    expect(parseClientMessage({ type: 'hostDecision', seat: 'a', decision: 'wait' }).ok).toBe(
      false,
    );
  });
});
