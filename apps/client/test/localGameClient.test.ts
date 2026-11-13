import { describe, expect, it } from 'vitest';
import type { GameEvent, GameView } from '@five-kingdoms/engine';
import { TOTAL_ROUNDS } from '@five-kingdoms/engine';
import { planDiscard, planFinalTurn, planGoOut } from '../src/game/plans';
import {
  ROOM_CODE_ALPHABET,
  isValidRoomCode,
  type ClientError,
  type RoomState,
} from '../src/net/GameClient';
import { LOCAL_PLAYER_ID, LocalGameClient, isDevHarness } from '../src/net/LocalGameClient';

const profile = { name: 'Tester', avatar: 'fox' };

/** A deterministic random source. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function harness(opponents: number, seed = 7) {
  const client = new LocalGameClient({ opponents, opponentDelayMs: 0, random: seeded(seed) });
  const state: {
    room: RoomState | null;
    view: GameView | null;
    errors: ClientError[];
    events: GameEvent[];
  } = {
    room: null,
    view: null,
    errors: [],
    events: [],
  };
  client.onRoom((r) => (state.room = r));
  client.onView((v) => (state.view = v));
  client.onError((e) => state.errors.push(e));
  client.onEvents((e) => state.events.push(...e));
  return { client, state };
}

/** Plays the human seat to the end of the game using only the public client API. */
async function playHuman(
  h: ReturnType<typeof harness>,
): Promise<{ rounds: number; wentOut: number }> {
  const { client, state } = h;
  let banned: number | null = null;
  let seen = 0;
  const syncBanned = (): void => {
    for (; seen < state.events.length; seen++) {
      const e = state.events[seen]!;
      if (e.type === 'drew')
        banned = e.playerId === LOCAL_PLAYER_ID && e.source === 'discard' ? e.card!.id : null;
      if (e.type === 'discarded' || e.type === 'wentOut' || e.type === 'laidDown') {
        if (e.playerId === LOCAL_PLAYER_ID) banned = null;
      }
    }
  };
  let rounds = 0;
  let wentOut = 0;
  for (let guard = 0; guard < 5000; guard++) {
    const view = state.view!;
    syncBanned();
    if (view.phase === 'gameOver') return { rounds, wentOut };
    if (view.phase === 'roundOver') {
      rounds++;
      await client.continueRound();
      continue;
    }
    expect(view.currentPlayerId).toBe(LOCAL_PLAYER_ID); // bots always run to the human
    const wild = view.wildRank!;
    if (view.phase === 'awaitingDraw') {
      await client.sendAction({ type: 'drawFromStock' });
    } else if (view.outPlayerId === null) {
      const out = planGoOut(view.hand, wild, banned);
      if (out) {
        wentOut++;
        await client.sendAction({
          type: 'goOut',
          melds: out.melds.map((m) => m.map((c) => c.id)),
          discardCardId: out.discard.id,
        });
      } else {
        await client.sendAction({
          type: 'discard',
          cardId: planDiscard(view.hand, wild, banned).id,
        });
      }
    } else {
      const plan = planFinalTurn(view.hand, wild, banned);
      await client.sendAction({
        type: 'finalTurnLayDown',
        melds: plan.melds.map((m) => m.map((c) => c.id)),
        discardCardId: plan.discard.id,
      });
    }
  }
  throw new Error('game did not finish');
}

describe('LocalGameClient lobby', () => {
  it('create makes a lobby with a valid code, a host and ready dev opponents', async () => {
    const { client, state } = harness(3);
    await client.createRoom(profile, { maxSeats: 5 });
    const room = state.room!;
    expect(isValidRoomCode(room.code)).toBe(true);
    expect([...room.code].every((ch) => ROOM_CODE_ALPHABET.includes(ch))).toBe(true);
    expect(room.hostId).toBe(LOCAL_PLAYER_ID);
    expect(room.settings.maxSeats).toBe(5);
    expect(room.players).toHaveLength(4);
    expect(room.players.filter((p) => p.name.endsWith('(dev)'))).toHaveLength(3);
    expect(room.players.find((p) => p.id === LOCAL_PLAYER_ID)?.ready).toBe(false);
    expect(state.view).toBeNull();
  });

  it('refuses to start until you are ready', async () => {
    const { client, state } = harness(2);
    await client.createRoom(profile);
    await client.start();
    expect(state.errors.at(-1)?.code).toBe('NOT_READY');
    expect(state.room?.phase).toBe('lobby');
    await client.setReady(true);
    await client.start();
    expect(state.room?.phase).toBe('inGame');
    expect(state.view?.phase).toBe('awaitingDraw');
  });

  it('validates max seats and drops surplus dev opponents', async () => {
    const { client, state } = harness(5);
    await client.createRoom(profile, { maxSeats: 7 });
    expect(state.room?.players).toHaveLength(6);
    await client.updateSettings({ maxSeats: 9 });
    expect(state.errors.at(-1)?.code).toBe('BAD_SETTINGS');
    await client.updateSettings({ maxSeats: 3 });
    expect(state.room?.settings.maxSeats).toBe(3);
    // The harness remembers the turn timer choice (it has no server to run the clock).
    expect(state.room?.settings.turnTimer).toBe(false);
    await client.updateSettings({ turnTimer: true });
    expect(state.room?.settings).toEqual({ maxSeats: 3, turnTimer: true });
    expect(state.room?.turnDeadline).toBeNull();
    expect(state.room?.players).toHaveLength(3);
  });

  it('dev harness adds and removes opponents within the seat limit', async () => {
    const { client, state } = harness(1);
    expect(isDevHarness(client)).toBe(true);
    await client.createRoom(profile, { maxSeats: 3 });
    client.addDevOpponent();
    client.addDevOpponent(); // over the limit: ignored
    expect(state.room?.players).toHaveLength(3);
    client.removeDevOpponent();
    expect(state.room?.players).toHaveLength(2);
  });

  it('join rejects malformed codes and otherwise lets a dev host start once ready', async () => {
    const { client, state } = harness(2);
    await client.joinRoom('!!', profile);
    expect(state.errors.at(-1)?.code).toBe('ROOM_NOT_FOUND');
    expect(state.room).toBeNull();

    await client.joinRoom('  abcde ', profile);
    expect(state.room?.code).toBe('ABCDE');
    expect(state.room?.hostId).not.toBe(LOCAL_PLAYER_ID);
    await client.start();
    expect(state.errors.at(-1)?.code).toBe('NOT_HOST');
    await client.updateSettings({ maxSeats: 4 });
    expect(state.errors.at(-1)?.code).toBe('NOT_HOST');
    await client.setReady(true);
    expect(state.room?.phase).toBe('inGame');
  });

  it('emits emotes and replays current state to late subscribers', async () => {
    const { client } = harness(2);
    await client.createRoom(profile);
    const seen: string[] = [];
    client.onEmote((e) => seen.push(`${e.playerId}:${e.emote}`));
    await client.sendEmote('wow');
    expect(seen).toEqual(['you:wow']);
    let replayed: RoomState | null = null;
    client.onRoom((r) => (replayed = r));
    expect(replayed).not.toBeNull();
  });

  it('leave returns to no room', async () => {
    const { client, state } = harness(2);
    await client.createRoom(profile);
    await client.leave();
    expect(state.room).toBeNull();
  });
});

describe('LocalGameClient game', () => {
  it('reports engine rejections as errors without changing the view', async () => {
    const { client, state } = harness(2);
    await client.createRoom(profile);
    await client.setReady(true);
    await client.start();
    // Make sure it is our turn: the human may be after a dev bot which has already played.
    expect(state.view?.currentPlayerId).toBe(LOCAL_PLAYER_ID);
    const before = state.view;
    await client.sendAction({ type: 'discard', cardId: before!.hand[0]!.id });
    expect(state.errors.at(-1)?.code).toBe('WRONG_PHASE');
    expect(state.view).toEqual(before);
    await client.continueRound();
    expect(state.errors.at(-1)?.code).toBe('WRONG_PHASE');
  });

  it('only ever shows the viewer their own cards', async () => {
    const { client, state } = harness(3);
    await client.createRoom(profile);
    await client.setReady(true);
    await client.start();
    expect(state.view!.hand).toHaveLength(3);
    for (const e of state.events) {
      if (e.type === 'dealt' && e.playerId !== LOCAL_PLAYER_ID) expect(e.cards).toBeUndefined();
    }
  });

  for (const opponents of [1, 3, 6]) {
    it(`plays a full ${TOTAL_ROUNDS}-round game to gameOver against ${opponents} dev opponents`, async () => {
      const h = harness(opponents, 100 + opponents);
      await h.client.createRoom(profile, { maxSeats: 7 });
      await h.client.setReady(true);
      await h.client.start();
      const { rounds, wentOut } = await playHuman(h);

      const view = h.state.view!;
      expect(view.phase).toBe('gameOver');
      expect(rounds).toBe(TOTAL_ROUNDS - 1); // the last round ends in gameOver, not roundOver
      expect(view.round).toBe(TOTAL_ROUNDS);
      expect(h.state.errors).toEqual([]);
      expect(view.players).toHaveLength(opponents + 1);
      for (const p of view.players) {
        expect(p.roundScores).toHaveLength(TOTAL_ROUNDS);
        expect(p.roundScores.reduce((a, b) => a + b, 0)).toBe(p.score);
      }
      const lowest = Math.min(...view.players.map((p) => p.score));
      expect(view.winnerIds.sort()).toEqual(
        view.players
          .filter((p) => p.score === lowest)
          .map((p) => p.id)
          .sort(),
      );
      expect(h.state.events.filter((e) => e.type === 'roundScored')).toHaveLength(TOTAL_ROUNDS);
      expect(h.state.events.at(-1)?.type).toBe('gameOver');
      expect(wentOut).toBeGreaterThanOrEqual(0);
    });
  }

  it('rematch returns to the lobby with the same seats and a fresh game after ready', async () => {
    const h = harness(2, 11);
    await h.client.createRoom(profile);
    await h.client.setReady(true);
    await h.client.start();
    await playHuman(h);
    const codeBefore = h.state.room!.code;
    await h.client.rematch();
    expect(h.state.room?.phase).toBe('lobby');
    expect(h.state.room?.code).toBe(codeBefore);
    expect(h.state.room?.players).toHaveLength(3);
    expect(h.state.room?.players.find((p) => p.id === LOCAL_PLAYER_ID)?.ready).toBe(false);
    expect(h.state.view).toBeNull();
    await h.client.setReady(true);
    await h.client.start();
    expect(h.state.view?.round).toBe(1);
    expect(h.state.view?.players.every((p) => p.score === 0)).toBe(true);
  });
});
