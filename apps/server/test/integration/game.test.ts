import { env } from 'cloudflare:workers';
import { evictDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { TestClient, lobbyOf, playTurn, sleep, startGame } from '../helpers/client';

describe('intents', () => {
  it('returns an illegal intent error only to the sender', async () => {
    const { clients } = await lobbyOf(2);
    await startGame(clients);
    const waiting = clients.find((c) => c.view!.currentPlayerId !== c.view!.viewerId)!;
    const mover = clients.find((c) => c !== waiting)!;
    mover.drain();
    waiting.send({ type: 'intent', action: { type: 'drawFromStock' }, lastVersion: 1 });
    const err = await waiting.next('error');
    expect(err.code).toBe('ENGINE');
    expect(err.engineCode).toBe('NOT_YOUR_TURN');
    await sleep(150);
    expect(mover.pending('error')).toHaveLength(0);
    expect(waiting.version).toBe(1); // state unchanged
  });

  it('never leaks one player’s hand to another', async () => {
    const { clients } = await lobbyOf(3);
    await startGame(clients);
    // Stop when someone goes out: round-end scoring legitimately reveals leftover cards.
    for (let i = 0; i < 6 && clients[0]!.view!.outPlayerId === null; i++) await playTurn(clients);

    for (const viewer of clients) {
      const seen = viewer.raw.join('\n');
      for (const other of clients) {
        if (other === viewer) continue;
        // Cards in the other hand now that the viewer has not been shown legitimately.
        for (const card of other.view!.hand) {
          const mine = viewer.view!.hand.some((c) => c.id === card.id);
          const publicDiscard = viewer.raw.some(
            (r) => r.includes('"discarded"') && r.includes(JSON.stringify(card)),
          );
          if (!mine && !publicDiscard) expect(seen).not.toContain(JSON.stringify(card));
        }
      }
    }
    // The deal reveals cards only to their owner.
    const deal = JSON.parse(clients[0]!.raw.find((r) => r.includes('"dealt"'))!) as {
      events: { type: string; playerId: string; cards?: unknown }[];
    };
    const dealt = deal.events.filter((e) => e.type === 'dealt');
    expect(dealt.filter((e) => e.cards !== undefined).map((e) => e.playerId)).toEqual(['p0']);
  });

  it('sends a full view when the client’s version is stale', async () => {
    const { clients } = await lobbyOf(2);
    await startGame(clients);
    const mover = clients.find((c) => c.view!.currentPlayerId === c.view!.viewerId)!;
    mover.send({ type: 'intent', action: { type: 'drawFromStock' }, lastVersion: 0 });
    const v = await mover.next('view');
    expect(v.version).toBe(2);
  });
});

describe('reconnect and hibernation', () => {
  it('restores the seat with the rejoin token and sends a fresh welcome', async () => {
    const { code, clients } = await lobbyOf(2);
    const [a, b] = clients as [TestClient, TestClient];
    await startGame(clients);
    const token = b.token!;
    b.close();
    await a.next('presence', (m) => !m.connected);
    const b2 = await TestClient.join(code, 'ignored', token);
    expect(b2.seat).toBe(1);
    const welcome = b2.inbox.find((m) => m.type === 'welcome')!;
    expect(welcome.type === 'welcome' && welcome.rejoinToken).toBeNull();
    expect(welcome.type === 'welcome' && welcome.view?.viewerId).toBe('p1');
    expect(welcome.type === 'welcome' && welcome.view?.hand).toHaveLength(3);
    expect(b2.view?.hand).toEqual(b.view?.hand);
    await a.next('presence', (m) => m.connected && m.seat === 1);
  });

  it('rejects an unknown token', async () => {
    const { code } = await lobbyOf(1);
    const c = await TestClient.open(code);
    c.send({
      type: 'join',
      roomCode: code,
      name: 'X',
      avatar: 'a',
      protocolVersion: 1,
      rejoinToken: 'nope',
    });
    expect((await c.next('error')).code).toBe('BAD_TOKEN');
  });

  it('keeps game state across eviction with hibernated sockets', async () => {
    const { code, clients } = await lobbyOf(2);
    await startGame(clients);
    await playTurn(clients);
    const versionBefore = clients[0]!.version;
    const handsBefore = clients.map((c) => c.view!.hand);

    await evictDurableObject(env.ROOM.get(env.ROOM.idFromName(code)));

    // The same sockets still work and the state was reloaded from storage.
    const after = await playTurn(clients);
    expect(after.version).toBe(versionBefore + 1);
    const mover = clients.find(
      (c) => c.view!.hand.length !== handsBefore[clients.indexOf(c)]!.length,
    );
    expect(mover).toBeDefined();
    // A fresh connection after eviction still gets its hand back.
    const rejoin = await TestClient.join(code, 'x', clients[1]!.token!);
    expect(rejoin.view?.hand.length).toBe(clients[1]!.view!.hand.length);
  });
});
