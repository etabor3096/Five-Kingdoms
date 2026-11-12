import type { GameEvent } from '@five-kingdoms/engine';
import { describe, expect, it } from 'vitest';
import { TestClient, lobbyOf, playTurn, startGame } from '../helpers/client';

/** Plays scripted turns until the table is at the round-end scoreboard (or game over). */
async function playToRoundEnd(clients: TestClient[]): Promise<void> {
  while (clients[0]!.view!.phase !== 'roundOver' && clients[0]!.view!.phase !== 'gameOver') {
    await playTurn(clients);
  }
}

const isScored = (e: GameEvent): e is Extract<GameEvent, { type: 'roundScored' }> =>
  e.type === 'roundScored';

describe('rounds', () => {
  it('starts the next round only when every connected player has continued', async () => {
    const { clients } = await lobbyOf(3);
    await startGame(clients);
    await playToRoundEnd(clients);
    expect(clients[0]!.view!.phase).toBe('roundOver');
    const version = clients[0]!.version;

    clients[0]!.send({ type: 'continue' });
    clients[1]!.send({ type: 'continue' });
    const partial = await clients[2]!.next('roomUpdate', (m) => m.room.continued.length === 2);
    expect(partial.room.continued.sort()).toEqual([0, 1]);
    expect(clients[2]!.version).toBe(version);

    clients[2]!.send({ type: 'continue' });
    const events = await Promise.all(
      clients.map((c) => c.next('events', (m) => m.version > version)),
    );
    expect(events[0]!.events.some((e) => e.type === 'roundStarted')).toBe(true);
    expect(clients[0]!.view!.round).toBe(2);
    expect(clients[0]!.view!.hand).toHaveLength(4);
  });

  it('replays the round scores to a client that reconnects at the scoreboard', async () => {
    const { code, clients } = await lobbyOf(3);
    const [a, b, c] = clients as [TestClient, TestClient, TestClient];
    await startGame(clients);
    await playToRoundEnd(clients);

    const scored = b.inbox.flatMap((m) => (m.type === 'events' ? m.events : [])).find(isScored);
    expect(scored).toBeDefined();
    const token = c.token!;
    c.close();
    await a.next('presence', (m) => !m.connected);

    const back = await TestClient.join(code, 'ignored', token);
    const welcome = back.inbox.find((m) => m.type === 'welcome');
    expect(welcome?.type === 'welcome' && welcome.view?.phase).toBe('roundOver');
    expect(welcome?.type === 'welcome' && welcome.lastRoundScored).toEqual(scored);

    // Once the next round starts the scores are no longer replayed.
    const version = a.version;
    for (const client of [a, b, back]) client.send({ type: 'continue' });
    await a.next('events', (m) => m.version > version);
    back.close();
    await a.next('presence', (m) => !m.connected);
    const later = await TestClient.join(code, 'ignored', token);
    const laterWelcome = later.inbox.find((m) => m.type === 'welcome');
    expect(laterWelcome?.type === 'welcome' && laterWelcome.view?.round).toBe(2);
    expect(laterWelcome?.type === 'welcome' && laterWelcome.lastRoundScored).toBeUndefined();
  });

  it('does not wait for a player who has disconnected', async () => {
    const { clients } = await lobbyOf(3);
    await startGame(clients);
    await playToRoundEnd(clients);
    const version = clients[0]!.version;
    clients[2]!.close();
    clients[0]!.send({ type: 'continue' });
    clients[1]!.send({ type: 'continue' });
    const e = await clients[0]!.next('events', (m) => m.version > version);
    expect(e.events.some((ev) => ev.type === 'roundStarted')).toBe(true);
  });

  it('plays a full 11-round game between three scripted clients, then offers a rematch', async () => {
    const { clients } = await lobbyOf(3);
    const [host, b, c] = clients as [TestClient, TestClient, TestClient];
    await startGame(clients);

    for (let guard = 0; guard < 5000 && host.view!.phase !== 'gameOver'; guard++) {
      if (host.view!.phase === 'roundOver') {
        const version = host.version;
        for (const client of clients) client.send({ type: 'continue' });
        await Promise.all(clients.map((x) => x.next('events', (m) => m.version > version)));
      } else {
        await playTurn(clients);
      }
    }

    for (const client of clients) {
      expect(client.view!.phase).toBe('gameOver');
      expect(client.view!.round).toBe(11);
      expect(client.view!.players.every((p) => p.roundScores.length === 11)).toBe(true);
    }
    const scores = host.view!.players.map((p) => p.score);
    const lowest = Math.min(...scores);
    expect(host.view!.winnerIds.length).toBeGreaterThan(0);
    for (const id of host.view!.winnerIds) {
      expect(host.view!.players.find((p) => p.id === id)!.score).toBe(lowest);
    }

    // Only the host can start a rematch; it returns to the lobby with everyone unready.
    b.send({ type: 'rematch' });
    expect((await b.next('error')).code).toBe('NOT_HOST');
    host.send({ type: 'rematch' });
    const lobby = await c.next('roomUpdate', (m) => m.room.status === 'lobby');
    expect(lobby.room.players.map((p) => p.seat)).toEqual([0, 1, 2]);
    expect(lobby.room.players.every((p) => !p.ready)).toBe(true);

    // ...and a second game can start with the same seats.
    await startGame(clients);
    expect(host.view!.round).toBe(1);
    expect(host.view!.players.every((p) => p.score === 0)).toBe(true);
  }, 120_000);

  it('rejects rematch and continue at the wrong time', async () => {
    const { clients } = await lobbyOf(2);
    await startGame(clients);
    clients[0]!.send({ type: 'rematch' });
    expect((await clients[0]!.next('error')).code).toBe('BAD_STATE');
    clients[0]!.send({ type: 'continue' });
    expect((await clients[0]!.next('error')).code).toBe('BAD_STATE');
  });
});
