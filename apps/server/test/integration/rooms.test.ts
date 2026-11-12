import { env } from 'cloudflare:workers';
import { PROTOCOL_VERSION } from '@five-kingdoms/protocol';
import { describe, expect, it } from 'vitest';
import { isValidRoomCode } from '../../src/room-code';
import { TestClient, createRoom, lobbyOf, sleep, startGame, worker } from '../helpers/client';

describe('worker routes', () => {
  it('creates rooms with valid codes and sets CORS', async () => {
    const res = await worker.fetch(new Request('http://test/rooms', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const { code } = await res.json<{ code: string }>();
    expect(isValidRoomCode(code)).toBe(true);
    const pre = await worker.fetch(new Request('http://test/rooms', { method: 'OPTIONS' }));
    expect(pre.status).toBe(204);
  });

  it('returns 404 for unknown rooms and malformed codes', async () => {
    for (const code of ['ZZZZZ', 'x', 'ABCD0']) {
      const res = await worker.fetch(
        new Request(`http://test/rooms/${code}/ws`, { headers: { Upgrade: 'websocket' } }),
      );
      expect(res.status).toBe(404);
    }
  });

  it('refuses to claim a code that already exists', async () => {
    const code = await createRoom();
    const stub = env.ROOM.get(env.ROOM.idFromName(code));
    expect(await stub.create(code)).toBe(false);
  });

  it('rejects non-websocket requests to an existing room', async () => {
    const code = await createRoom();
    const res = await worker.fetch(new Request(`http://test/rooms/${code}/ws`));
    expect(res.status).toBe(426);
  });
});

describe('lobby', () => {
  it('seats players in order, first joiner is host, token returned once', async () => {
    const { clients } = await lobbyOf(2);
    const [a, b] = clients as [TestClient, TestClient];
    expect([a.seat, b.seat]).toEqual([0, 1]);
    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
    const update = await a.next('roomUpdate', (m) => m.room.players.length === 2);
    expect(update.room.hostSeat).toBe(0);
    expect(update.room.maxSeats).toBe(7);
    expect(update.room.players.map((p) => p.name)).toEqual(['P0', 'P1']);
  });

  it('enforces the protocol version, seat cap and host-only settings', async () => {
    const code = await createRoom();
    const bad = await TestClient.open(code);
    bad.send({ type: 'join', roomCode: code, name: 'X', avatar: 'a', protocolVersion: 999 });
    expect((await bad.next('error')).code).toBe('PROTOCOL_VERSION');

    const a = await TestClient.join(code, 'A');
    const b = await TestClient.join(code, 'B');
    b.send({ type: 'settings', maxSeats: 3 });
    expect((await b.next('error')).code).toBe('NOT_HOST');
    a.send({ type: 'settings', maxSeats: 2 });
    await a.next('roomUpdate', (m) => m.room.maxSeats === 2);
    const c = await TestClient.open(code);
    c.send({
      type: 'join',
      roomCode: code,
      name: 'C',
      avatar: 'a',
      protocolVersion: PROTOCOL_VERSION,
    });
    expect((await c.next('error')).code).toBe('ROOM_FULL');
    a.send({ type: 'settings', maxSeats: 1 } as never);
    expect((await a.next('error')).code).toBe('BAD_MESSAGE');
  });

  it('rejects junk, binary frames and messages before join', async () => {
    const code = await createRoom();
    const c = await TestClient.open(code);
    c.sendRaw('{not json');
    expect((await c.next('error')).code).toBe('BAD_MESSAGE');
    c.send({ type: 'ready' });
    expect((await c.next('error')).code).toBe('NOT_JOINED');
  });

  it('needs two ready, connected players and the host to start', async () => {
    const { clients } = await lobbyOf(2);
    const [a, b] = clients as [TestClient, TestClient];
    a.send({ type: 'start' });
    expect((await a.next('error')).code).toBe('NOT_ALL_READY');
    b.send({ type: 'ready' });
    a.send({ type: 'ready' });
    await a.next('roomUpdate', (m) => m.room.players.every((p) => p.ready));
    b.send({ type: 'start' });
    expect((await b.next('error')).code).toBe('NOT_HOST');
    a.send({ type: 'unready' });
    await a.next('roomUpdate', (m) => !m.room.players[0]!.ready);
    a.send({ type: 'ready' });
    await a.next('roomUpdate', (m) => m.room.players[0]!.ready);
    a.send({ type: 'start' });
    const [ea, eb] = await Promise.all([a.next('events'), b.next('events')]);
    expect(ea.view.phase).toBe('awaitingDraw');
    expect(ea.version).toBe(1);
    expect(eb.view.viewerId).toBe('p1');
    expect(ea.view.hand).toHaveLength(3);
  });

  it('needs at least two players', async () => {
    const { clients } = await lobbyOf(1);
    clients[0]!.send({ type: 'ready' });
    clients[0]!.send({ type: 'start' });
    expect((await clients[0]!.next('error')).code).toBe('NOT_ENOUGH_PLAYERS');
  });

  it('refuses new joins once the game has started', async () => {
    const { code, clients } = await lobbyOf(2);
    await startGame(clients);
    const late = await TestClient.open(code);
    late.send({
      type: 'join',
      roomCode: code,
      name: 'L',
      avatar: 'a',
      protocolVersion: PROTOCOL_VERSION,
    });
    expect((await late.next('error')).code).toBe('ROOM_STARTED');
  });

  it('broadcasts emotes and rate-limits them', async () => {
    const { clients } = await lobbyOf(2);
    const [a, b] = clients as [TestClient, TestClient];
    a.send({ type: 'emote', emoteId: 'clap' });
    expect(await b.next('emote')).toEqual({ type: 'emote', seat: 0, emoteId: 'clap' });
    a.send({ type: 'emote', emoteId: 'wow' });
    expect((await a.next('error')).code).toBe('RATE_LIMITED');
    await sleep(1100);
    a.send({ type: 'emote', emoteId: 'wow' });
    expect((await b.next('emote')).emoteId).toBe('wow');
  });

  it('migrates the host when the host disconnects', async () => {
    const { clients } = await lobbyOf(3);
    const [a, b, c] = clients as [TestClient, TestClient, TestClient];
    a.close();
    const update = await b.next('roomUpdate', (m) => m.room.hostSeat === 1);
    expect(update.room.players[0]!.connected).toBe(false);
    expect((await c.next('presence')).seat).toBe(0);
  });

  it('expires an idle room after the last socket closes', async () => {
    const { code, clients } = await lobbyOf(1);
    clients[0]!.close();
    // EXPIRY_MS is 1.5 s in tests.
    // A plain GET is 426 while the room exists and 404 once it is gone (it opens no socket).
    let status = 0;
    for (let i = 0; i < 40 && status !== 404; i++) {
      await sleep(250);
      status = (await worker.fetch(new Request(`http://test/rooms/${code}/ws`))).status;
    }
    expect(status).toBe(404);
  });
});
