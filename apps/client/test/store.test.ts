import { describe, expect, it, vi } from 'vitest';
import { ClientStore } from '../src/state/clientStore';
import { selectScreen } from '../src/state/screens';
import { LocalGameClient } from '../src/net/LocalGameClient';
import type { GameView } from '@five-kingdoms/engine';
import type { RoomState } from '../src/net/GameClient';

const room = (phase: RoomState['phase']): RoomState => ({
  code: 'ABCD',
  selfId: 'you',
  hostId: 'you',
  phase,
  settings: { maxSeats: 4 },
  players: [],
});
const view = (phase: GameView['phase']): GameView => ({ phase }) as GameView;

describe('selectScreen', () => {
  it('walks the documented flow', () => {
    expect(selectScreen(null, null, false)).toBe('menu');
    expect(selectScreen(room('lobby'), null, false)).toBe('lobby');
    expect(selectScreen(room('inGame'), view('awaitingDraw'), false)).toBe('table');
    expect(selectScreen(room('inGame'), view('awaitingDiscard'), false)).toBe('table');
    expect(selectScreen(room('inGame'), view('roundOver'), false)).toBe('scoreboard');
    expect(selectScreen(room('inGame'), view('gameOver'), false)).toBe('scoreboard');
    expect(selectScreen(room('inGame'), view('gameOver'), true)).toBe('standings');
    expect(selectScreen(room('lobby'), view('gameOver'), true)).toBe('lobby');
  });
});

describe('ClientStore', () => {
  it('shows engine errors as a toast that clears itself, and tracks emotes', async () => {
    vi.useFakeTimers();
    try {
      const client = new LocalGameClient({ opponents: 1, opponentDelayMs: 0 });
      const store = new ClientStore(client);
      await client.createRoom({ name: 'T', avatar: 'fox' });
      await client.start(); // not ready -> error
      expect(store.getSnapshot().toast?.text).toMatch(/ready/i);
      vi.advanceTimersByTime(4000);
      expect(store.getSnapshot().toast).toBeNull();

      await client.sendEmote('clap');
      expect(store.getSnapshot().emotes['you']?.emote).toBe('clap');
      vi.advanceTimersByTime(3000);
      expect(store.getSnapshot().emotes['you']).toBeUndefined();

      await client.leave();
      expect(store.getSnapshot().room).toBeNull();
      store.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('remembers the card taken from the discard pile until you discard', async () => {
    const client = new LocalGameClient({ opponents: 1, opponentDelayMs: 0, random: () => 0.3 });
    const store = new ClientStore(client);
    await client.createRoom({ name: 'T', avatar: 'fox' });
    await client.setReady(true);
    await client.start();
    const v = store.getSnapshot().view!;
    expect(v.currentPlayerId).toBe('you');
    await client.sendAction({ type: 'drawFromDiscard' });
    const banned = store.getSnapshot().bannedDiscardId;
    expect(banned).not.toBeNull();
    expect(store.getSnapshot().view!.hand.some((c) => c.id === banned)).toBe(true);
    const other = store.getSnapshot().view!.hand.find((c) => c.id !== banned)!;
    await client.sendAction({ type: 'discard', cardId: other.id });
    expect(store.getSnapshot().bannedDiscardId).toBeNull();
    store.dispose();
  });
});
