import { describe, expect, it } from 'vitest';
import type { GameEvent, GameView } from '@five-kingdoms/engine';
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type RoomInfo,
  type ServerMessage,
} from '@five-kingdoms/protocol';
import type { ClientError, ConnectionState, RoomState } from '../src/net/GameClient';
import {
  PONG_TIMEOUT_MS,
  RECONNECT_DELAYS_MS,
  RemoteGameClient,
  rejoinTokenKey,
  type SocketLike,
} from '../src/net/RemoteGameClient';
import { memoryStore } from '../src/storage/keyValueStore';

const profile = { name: 'Ann', avatar: 'fox' };

/** A scriptable stand-in for a WebSocket. */
class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  closedWith: number | undefined;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(code = 1000): void {
    this.closedWith = code;
    this.readyState = 3;
  }
  // ---- test controls
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message: ServerMessage | 'pong'): void {
    this.onmessage?.({ data: message === 'pong' ? message : JSON.stringify(message) });
  }
  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  /** Parsed JSON messages the client sent (heartbeat strings excluded). */
  get messages(): ClientMessage[] {
    return this.sent.filter((s) => s !== 'ping').map((s) => JSON.parse(s) as ClientMessage);
  }
}

const roomInfo = (patch: Partial<RoomInfo> = {}): RoomInfo => ({
  code: 'ABCDE',
  status: 'lobby',
  hostSeat: 0,
  maxSeats: 7,
  players: [
    { seat: 0, name: 'Ann', avatar: 'fox', ready: false, connected: true, skipped: false },
    { seat: 1, name: 'Bo', avatar: 'owl', ready: true, connected: false, skipped: true },
  ],
  continued: [],
  pause: null,
  ...patch,
});

const view = (phase: string, extra: Partial<GameView> = {}): GameView =>
  ({ phase, viewerId: 'p0', ...extra }) as unknown as GameView;

const welcome = (
  patch: Partial<Extract<ServerMessage, { type: 'welcome' }>> = {},
): Extract<ServerMessage, { type: 'welcome' }> => ({
  type: 'welcome',
  seat: 0,
  rejoinToken: 'TOKEN-1',
  room: roomInfo(),
  view: null,
  version: 0,
  ...patch,
});

/** Builds a client wired to fakes, plus recorders for everything it publishes. */
function setup(options: { serverUrl?: string; fetchStatus?: number | 'throw' } = {}) {
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const fetches: { url: string; method: string }[] = [];
  const store = memoryStore();
  let visible: (() => void) | null = null;
  const probeStatus = { value: options.fetchStatus ?? 426 };

  const client = new RemoteGameClient({
    serverUrl: options.serverUrl ?? 'http://localhost:8787',
    store,
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    fetch: ((url: string, init?: { method?: string }) => {
      fetches.push({ url, method: init?.method ?? 'GET' });
      if (init?.method === 'POST') {
        if (probeStatus.value === 'throw') return Promise.reject(new Error('offline'));
        return Promise.resolve(Response.json({ code: 'ABCDE' }));
      }
      if (probeStatus.value === 'throw') return Promise.reject(new Error('offline'));
      return Promise.resolve(new Response(null, { status: probeStatus.value }));
    }) as typeof fetch,
    schedule: (fn, ms) => {
      const timer = { fn, ms, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
    onVisible: (listener) => {
      visible = listener;
      return () => {
        visible = null;
      };
    },
  });

  const log: string[] = [];
  const seen = {
    room: null as RoomState | null,
    view: null as GameView | null,
    errors: [] as ClientError[],
    connection: [] as ConnectionState[],
    events: [] as GameEvent[][],
    emotes: [] as { playerId: string; emote: string }[],
  };
  client.onRoom((r) => (seen.room = r));
  client.onView((v) => {
    seen.view = v;
    log.push('view');
  });
  client.onEvents((e) => {
    seen.events.push(e);
    log.push('events');
  });
  client.onError((e) => seen.errors.push(e));
  client.onConnection((c) => seen.connection.push(c));
  client.onEmote((e) => seen.emotes.push(e));

  /** Lets queued promise callbacks (fetch, storage, probe) run. */
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  };
  const livetimers = () => timers.filter((t) => t.live);
  const fireNextTimer = (): number => {
    const t = livetimers()[0]!;
    t.live = false;
    t.fn();
    return t.ms;
  };
  return {
    client,
    sockets,
    fetches,
    store,
    seen,
    log,
    flush,
    livetimers,
    fireNextTimer,
    probeStatus,
    triggerVisible: () => visible?.(),
    last: () => sockets[sockets.length - 1]!,
  };
}

/** Joins a room end to end and returns the connected socket. */
async function joined(t: ReturnType<typeof setup>, w: Partial<Parameters<typeof welcome>[0]> = {}) {
  const pending = t.client.joinRoom('abcde', profile);
  await t.flush();
  t.last().open();
  t.last().receive(welcome(w));
  await pending;
  return t.last();
}

describe('RemoteGameClient: joining', () => {
  it('createRoom POSTs /rooms, then joins over ws:// and maps the welcome', async () => {
    const t = setup();
    const pending = t.client.createRoom(profile, { maxSeats: 5 });
    await t.flush();
    expect(t.fetches[0]).toEqual({ url: 'http://localhost:8787/rooms', method: 'POST' });
    expect(t.last().url).toBe('ws://localhost:8787/rooms/ABCDE/ws');

    t.last().open();
    expect(t.last().messages[0]).toEqual({
      type: 'join',
      roomCode: 'ABCDE',
      name: 'Ann',
      avatar: 'fox',
      protocolVersion: PROTOCOL_VERSION,
    });
    t.last().receive(welcome());
    await pending;

    const room = t.seen.room!;
    expect(room.code).toBe('ABCDE');
    expect(room.selfId).toBe('p0');
    expect(room.hostId).toBe('p0');
    expect(room.phase).toBe('lobby');
    expect(room.players.map((p) => [p.id, p.isHost, p.connected, p.skipped])).toEqual([
      ['p0', true, true, false],
      ['p1', false, false, true],
    ]);
    // The new room defaults to 7 seats; the menu asked for 5, so the host applies it.
    expect(t.last().messages[1]).toEqual({ type: 'settings', maxSeats: 5 });
  });

  it('derives wss:// from an https:// server URL', async () => {
    const t = setup({ serverUrl: 'https://rooms.example.com/' });
    void t.client.joinRoom('abcde', profile);
    await t.flush();
    expect(t.last().url).toBe('wss://rooms.example.com/rooms/ABCDE/ws');
  });

  it('maps pause info and the continued list onto the room state', async () => {
    const t = setup();
    const socket = await joined(t);
    socket.receive({
      type: 'roomUpdate',
      room: roomInfo({
        status: 'game',
        hostSeat: 1,
        continued: [1],
        pause: { seats: [1], deadline: 123456, expired: true },
      }),
    });
    const room = t.seen.room!;
    expect(room.phase).toBe('inGame');
    expect(room.hostId).toBe('p1'); // host migration shows up as a new hostId
    expect(room.players[1]!.isHost).toBe(true);
    expect(room.continuedIds).toEqual(['p1']);
    expect(room.pause).toEqual({ awayIds: ['p1'], deadline: 123456, expired: true });
  });

  it('rejects malformed room codes without touching the network', async () => {
    const t = setup();
    await t.client.joinRoom('12', profile);
    expect(t.seen.errors[0]!.code).toBe('ROOM_NOT_FOUND');
    expect(t.sockets).toHaveLength(0);
  });
});

describe('RemoteGameClient: message mapping', () => {
  it('delivers events before the view they led to', async () => {
    const t = setup();
    const socket = await joined(t, {
      room: roomInfo({ status: 'game' }),
      view: view('awaitingDraw'),
    });
    t.log.length = 0;
    const events = [{ type: 'discarded' }] as unknown as GameEvent[];
    socket.receive({ type: 'events', events, view: view('awaitingDiscard'), version: 1 });
    expect(t.log).toEqual(['events', 'view']);
    expect(t.seen.events[0]).toEqual(events);
    expect(t.seen.view?.phase).toBe('awaitingDiscard');
  });

  it('replays lastRoundScored from a reconnect welcome as an event before the view', async () => {
    const t = setup();
    const scored = { type: 'roundScored', round: 1, scores: [] } as GameEvent;
    await joined(t, {
      room: roomInfo({ status: 'game' }),
      view: view('roundOver'),
      version: 9,
      lastRoundScored: scored as Extract<GameEvent, { type: 'roundScored' }>,
    });
    expect(t.log.slice(-2)).toEqual(['events', 'view']);
    expect(t.seen.events.at(-1)).toEqual([scored]);
  });

  it('ignores events it has already seen and keeps newer views', async () => {
    const t = setup();
    const socket = await joined(t, {
      room: roomInfo({ status: 'game' }),
      view: view('awaitingDraw'),
      version: 4,
    });
    socket.receive({ type: 'events', events: [], view: view('awaitingDiscard'), version: 4 });
    expect(t.seen.view?.phase).toBe('awaitingDraw');
    socket.receive({ type: 'events', events: [], view: view('awaitingDiscard'), version: 5 });
    expect(t.seen.view?.phase).toBe('awaitingDiscard');
    socket.receive({ type: 'view', view: view('awaitingDraw'), version: 3 });
    expect(t.seen.view?.phase).toBe('awaitingDiscard');
  });

  it('maps emotes to player ids and clears the view when a rematch returns to the lobby', async () => {
    const t = setup();
    const socket = await joined(t, { room: roomInfo({ status: 'game' }), view: view('gameOver') });
    socket.receive({ type: 'emote', seat: 1, emoteId: 'clap' });
    expect(t.seen.emotes).toEqual([{ playerId: 'p1', emote: 'clap' }]);
    socket.receive({ type: 'roomUpdate', room: roomInfo({ status: 'lobby' }) });
    expect(t.seen.view).toBeNull();
  });

  it('sends client messages with the newest version it has seen', async () => {
    const t = setup();
    const socket = await joined(t, {
      room: roomInfo({ status: 'game' }),
      view: view('awaitingDraw'),
      version: 7,
    });
    await t.client.sendAction({ type: 'drawFromStock' });
    await t.client.setReady(true);
    await t.client.continueRound();
    await t.client.sendEmote('wow');
    await t.client.hostDecision('p1', 'skip');
    expect(socket.messages.slice(1)).toEqual([
      { type: 'intent', action: { type: 'drawFromStock' }, lastVersion: 7 },
      { type: 'ready' },
      { type: 'continue' },
      { type: 'emote', emoteId: 'wow' },
      { type: 'hostDecision', seat: 1, decision: 'skip' },
    ]);
  });
});

describe('RemoteGameClient: rejoin token', () => {
  it('stores the token per room, and sends it on the next join', async () => {
    const t = setup();
    await joined(t);
    expect(await t.store.getItem(rejoinTokenKey('ABCDE'))).toBe('TOKEN-1');

    await t.client.leave();
    const again = setup();
    await again.store.setItem(rejoinTokenKey('ABCDE'), 'TOKEN-1');
    void again.client.joinRoom('ABCDE', profile);
    await again.flush();
    again.last().open();
    expect(again.last().messages[0]).toMatchObject({ type: 'join', rejoinToken: 'TOKEN-1' });
  });

  it('keeps the stored token when a rejoin welcome carries none', async () => {
    const t = setup();
    await t.store.setItem(rejoinTokenKey('ABCDE'), 'TOKEN-1');
    await joined(t, { rejoinToken: null });
    expect(await t.store.getItem(rejoinTokenKey('ABCDE'))).toBe('TOKEN-1');
  });

  it('reuses the token on automatic reconnects', async () => {
    const t = setup();
    const first = await joined(t);
    first.drop();
    await t.flush();
    t.fireNextTimer();
    t.last().open();
    expect(t.last().messages[0]).toMatchObject({ type: 'join', rejoinToken: 'TOKEN-1' });
  });
});

describe('RemoteGameClient: reconnecting', () => {
  it('backs off 0.5s, 1s, 2s, then 5s, and resets after a welcome', async () => {
    const t = setup();
    const first = await joined(t);
    first.drop();
    await t.flush();
    expect(t.seen.connection.at(-1)).toBe('reconnecting');

    const waits: number[] = [];
    for (let i = 0; i < 5; i++) {
      waits.push(t.fireNextTimer());
      t.last().drop(); // the attempt fails before opening (server unreachable)
      await t.flush();
    }
    expect(waits).toEqual([...RECONNECT_DELAYS_MS, RECONNECT_DELAYS_MS.at(-1)]);

    t.fireNextTimer();
    t.last().open();
    t.last().receive(welcome({ rejoinToken: null }));
    expect(t.seen.connection.at(-1)).toBe('online');

    t.last().drop();
    await t.flush();
    expect(t.fireNextTimer()).toBe(RECONNECT_DELAYS_MS[0]);
  });

  it('gives up with ROOM_NOT_FOUND when the room has expired (404)', async () => {
    const t = setup();
    const first = await joined(t);
    first.drop();
    await t.flush();
    // The retry never opens, and the server now says the room is gone.
    t.probeStatus.value = 404;
    t.fireNextTimer();
    t.last().drop();
    await t.flush();
    expect(t.seen.errors.at(-1)?.code).toBe('ROOM_NOT_FOUND');
    expect(t.seen.room).toBeNull();
    expect(t.livetimers()).toHaveLength(0);
  });

  it('does not reconnect after another device took over the seat (close code 4001)', async () => {
    const t = setup();
    const first = await joined(t);
    first.drop(4001);
    await t.flush();
    expect(t.seen.errors.at(-1)?.code).toBe('REPLACED');
    expect(t.livetimers()).toHaveLength(0);
  });

  it('reports sends made while offline instead of losing them silently', async () => {
    const t = setup();
    const first = await joined(t);
    first.drop();
    await t.flush();
    await t.client.setReady(true);
    expect(t.seen.errors.at(-1)?.code).toBe('NETWORK');
  });
});

describe('RemoteGameClient: page visibility', () => {
  it('pings when visible and stays connected when the pong arrives', async () => {
    const t = setup();
    const socket = await joined(t);
    t.triggerVisible();
    expect(socket.sent.at(-1)).toBe('ping');
    expect(t.livetimers()[0]!.ms).toBe(PONG_TIMEOUT_MS);
    socket.receive('pong');
    expect(t.livetimers()).toHaveLength(0);
    expect(t.sockets).toHaveLength(1);
  });

  it('reconnects at once when the pong never comes', async () => {
    const t = setup();
    const socket = await joined(t);
    t.triggerVisible();
    t.fireNextTimer(); // the pong timeout
    expect(socket.closedWith).toBeDefined();
    expect(t.sockets).toHaveLength(2);
    expect(t.seen.connection.at(-1)).toBe('reconnecting');
    t.last().open();
    t.last().receive(welcome({ rejoinToken: null }));
    expect(t.seen.connection.at(-1)).toBe('online');
    // The old socket's late close event must not disturb the new connection.
    socket.drop();
    await t.flush();
    expect(t.sockets).toHaveLength(2);
    expect(t.seen.connection.at(-1)).toBe('online');
  });

  it('skips the backoff wait when the page returns while reconnecting', async () => {
    const t = setup();
    const socket = await joined(t);
    socket.drop();
    await t.flush();
    t.triggerVisible();
    expect(t.sockets).toHaveLength(2);
    expect(t.livetimers()).toHaveLength(0);
  });
});

describe('RemoteGameClient: errors', () => {
  it('forwards engine rejections with the engine code', async () => {
    const t = setup();
    const socket = await joined(t, {
      room: roomInfo({ status: 'game' }),
      view: view('awaitingDraw'),
    });
    socket.receive({
      type: 'error',
      code: 'ENGINE',
      engineCode: 'NOT_YOUR_TURN',
      message: 'Not your turn',
    });
    expect(t.seen.errors.at(-1)).toEqual({ code: 'NOT_YOUR_TURN', message: 'Not your turn' });
  });

  it('maps room-level server errors', async () => {
    const t = setup();
    const socket = await joined(t);
    socket.receive({ type: 'error', code: 'NOT_ALL_READY', message: 'Everyone must be ready' });
    socket.receive({ type: 'error', code: 'PAUSED', message: 'paused' });
    expect(t.seen.errors.map((e) => e.code)).toEqual(['NOT_READY', 'PAUSED']);
  });

  it('turns a protocol mismatch on join into a clear message and leaves no room', async () => {
    const t = setup();
    const pending = t.client.joinRoom('abcde', profile);
    await t.flush();
    t.last().open();
    t.last().receive({
      type: 'error',
      code: 'PROTOCOL_VERSION',
      message: 'Server speaks protocol 2',
    });
    await pending;
    const error = t.seen.errors.at(-1)!;
    expect(error.code).toBe('PROTOCOL_VERSION');
    expect(error.message).toMatch(/out of date/);
    expect(error.message).toMatch(/protocol 2/);
    expect(t.seen.room).toBeNull();
    expect(t.last().closedWith).toBeDefined();
    expect(t.livetimers()).toHaveLength(0);
  });

  it('reports a full room, and drops an unknown token', async () => {
    const t = setup();
    const pending = t.client.joinRoom('abcde', profile);
    await t.flush();
    t.last().open();
    t.last().receive({ type: 'error', code: 'ROOM_FULL', message: 'The room is full' });
    await pending;
    expect(t.seen.errors.at(-1)?.code).toBe('ROOM_FULL');

    await t.store.setItem(rejoinTokenKey('ABCDE'), 'STALE');
    const second = t.client.joinRoom('abcde', profile);
    await t.flush();
    t.last().open();
    t.last().receive({ type: 'error', code: 'BAD_TOKEN', message: 'Unknown rejoin token' });
    await second;
    expect(t.seen.errors.at(-1)?.code).toBe('BAD_TOKEN');
    expect(await t.store.getItem(rejoinTokenKey('ABCDE'))).toBe('');
  });

  it('tells a missing room (404) from an unreachable server', async () => {
    const missing = setup({ fetchStatus: 404 });
    const a = missing.client.joinRoom('abcde', profile);
    await missing.flush();
    missing.last().drop();
    await a;
    expect(missing.seen.errors.at(-1)?.code).toBe('ROOM_NOT_FOUND');

    const down = setup({ fetchStatus: 'throw' });
    const b = down.client.joinRoom('abcde', profile);
    await down.flush();
    down.last().drop();
    await b;
    expect(down.seen.errors.at(-1)?.code).toBe('NETWORK');
  });

  it('reports NETWORK when creating a room cannot reach the server', async () => {
    const t = setup({ fetchStatus: 'throw' });
    await t.client.createRoom(profile);
    expect(t.seen.errors.at(-1)?.code).toBe('NETWORK');
    expect(t.sockets).toHaveLength(0);
  });
});
