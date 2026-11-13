/**
 * The real `GameClient`: talks to the room server over HTTP (create a room) and a WebSocket
 * (everything else), speaking the messages in `@five-kingdoms/protocol`.
 *
 * Life of a session
 *  1. `createRoom` does `POST /rooms`; `joinRoom` skips that. Both then open
 *     `/rooms/:code/ws` and send `join`, resolving once `welcome` (or an error) comes back.
 *  2. The server returns a rejoin token only on the first join. It is saved per room code in
 *     the device store and sent again on every later connection.
 *  3. If the socket drops after joining, the client reconnects on its own with backoff
 *     (see `RECONNECT_DELAYS_MS`) and the server answers with a fresh `welcome`.
 *  4. When the page becomes visible again it sends `ping` and expects `pong` quickly;
 *     mobile browsers and home-screen apps can kill sockets without telling the page.
 *
 * Everything outside the class (socket, fetch, timers, visibility) is injected so the whole
 * thing can be driven by fakes in tests.
 */

import type { GameEvent, GameView } from '@five-kingdoms/engine';
import {
  PING,
  PONG,
  PROTOCOL_VERSION,
  type ClientMessage,
  type EmoteId,
  type IntentAction,
  type RoomInfo,
  type ServerMessage,
} from '@five-kingdoms/protocol';
import type { KeyValueStore } from '../storage/keyValueStore';
import { toWebSocketBase } from './config';
import {
  isValidRoomCode,
  normalizeRoomCode,
  type ClientError,
  type ConnectionState,
  type EmoteEvent,
  type GameClient,
  type Profile,
  type RoomPlayer,
  type RoomSettings,
  type RoomState,
  type Unsubscribe,
} from './GameClient';

/** Waits before reconnect attempts 1, 2, 3, ...; the last value repeats forever. */
export const RECONNECT_DELAYS_MS = [500, 1000, 2000, 5000];
/** How long after a visibility-triggered `ping` we wait for `pong` before reconnecting. */
export const PONG_TIMEOUT_MS = 2000;
/** The server closes a socket with this code when a newer connection took over its seat. */
const REPLACED_CLOSE_CODE = 4001;
/** The Worker's 404 body for an unknown or expired room. */
const ROOM_NOT_FOUND_BODY = 'Room not found';
/** `WebSocket.OPEN`, spelled out so fakes do not need the global. */
const SOCKET_OPEN = 1;
/** Seats at a new room when the menu does not say otherwise. */
const DEFAULT_MAX_SEATS = 4;

/** The slice of the browser `WebSocket` this client uses. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
}

export interface RemoteGameClientOptions {
  /** HTTP base URL of the server, e.g. `http://localhost:8787`. `ws(s)://` is derived from it. */
  serverUrl: string;
  /** Where rejoin tokens live (localStorage on web, AsyncStorage on native). */
  store: KeyValueStore;
  /** Opens a WebSocket. Default: the global `WebSocket`. */
  createSocket?: (url: string) => SocketLike;
  /** Default: the global `fetch`. */
  fetch?: typeof fetch;
  /** Runs `fn` after `ms`; returns a cancel function. Default: `setTimeout`. */
  schedule?: (fn: () => void, ms: number) => () => void;
  /** Subscribes to "the page became visible again". Default: `visibilitychange` on web. */
  onVisible?: (listener: () => void) => Unsubscribe;
}

/** Per-room storage key for the rejoin token. */
export const rejoinTokenKey = (code: string): string => `five-kingdoms.rejoin.v1.${code}`;

/**
 * The engine player id for a seat. The server defines this (`playerIdForSeat`): seats are
 * dense 0..n-1 and ids are `p0`, `p1`, ...
 */
export const playerIdForSeat = (seat: number): string => `p${seat}`;

/** Inverse of `playerIdForSeat`. */
const seatForPlayerId = (id: string): number => Number(id.slice(1));

/** Maps a server error code to the client's error code. Engine errors keep the engine's code. */
const ERROR_CODES: Record<string, ClientError['code']> = {
  BAD_MESSAGE: 'BAD_MESSAGE',
  PROTOCOL_VERSION: 'PROTOCOL_VERSION',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_STARTED: 'ROOM_STARTED',
  BAD_TOKEN: 'BAD_TOKEN',
  NOT_JOINED: 'NOT_IN_ROOM',
  ALREADY_JOINED: 'WRONG_ROOM_PHASE',
  NOT_HOST: 'NOT_HOST',
  BAD_STATE: 'WRONG_ROOM_PHASE',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  NOT_ALL_READY: 'NOT_READY',
  INVALID_SETTINGS: 'BAD_SETTINGS',
  PAUSED: 'PAUSED',
  RATE_LIMITED: 'RATE_LIMITED',
  NO_SUCH_SEAT: 'NO_SUCH_SEAT',
};

/** Server error codes that mean "you are not in the room" when received during `join`. */
const JOIN_FAILURES = new Set(['ROOM_FULL', 'ROOM_STARTED', 'PROTOCOL_VERSION', 'BAD_TOKEN']);

type Listeners = {
  room: Set<(room: RoomState | null) => void>;
  view: Set<(view: GameView | null) => void>;
  events: Set<(events: GameEvent[]) => void>;
  emote: Set<(emote: EmoteEvent) => void>;
  error: Set<(error: ClientError) => void>;
  connection: Set<(state: ConnectionState) => void>;
};

/** What we know about the room we are trying to be in. */
interface Session {
  code: string;
  profile: Profile;
  /** The rejoin token, once we have one. */
  token: string | null;
  /** True after the first `welcome`; from then on a drop means "reconnect", not "failed". */
  joined: boolean;
  /** Settings to apply right after the first welcome (a freshly created room only). */
  initialSettings: Partial<RoomSettings> | null;
  /** Called when the join attempt succeeds or fails for good. */
  settle: (() => void) | null;
}

export class RemoteGameClient implements GameClient {
  private readonly httpBase: string;
  private readonly wsBase: string;
  private readonly store: KeyValueStore;
  private readonly createSocket: (url: string) => SocketLike;
  private readonly doFetch: typeof fetch;
  private readonly schedule: (fn: () => void, ms: number) => () => void;
  private readonly stopVisibility: Unsubscribe;

  private session: Session | null = null;
  private socket: SocketLike | null = null;
  private selfId = '';
  private room: RoomState | null = null;
  private view: GameView | null = null;
  private version = 0;
  private connection: ConnectionState = 'online';
  /** Reconnect attempts since the last welcome; indexes `RECONNECT_DELAYS_MS`. */
  private attempt = 0;
  private cancelRetry: (() => void) | null = null;
  private cancelPong: (() => void) | null = null;

  private readonly listeners: Listeners = {
    room: new Set(),
    view: new Set(),
    events: new Set(),
    emote: new Set(),
    error: new Set(),
    connection: new Set(),
  };

  constructor(options: RemoteGameClientOptions) {
    this.httpBase = options.serverUrl.replace(/\/+$/, '');
    this.wsBase = toWebSocketBase(options.serverUrl);
    this.store = options.store;
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url) as SocketLike);
    this.doFetch = options.fetch ?? ((...args) => fetch(...args));
    this.schedule =
      options.schedule ??
      ((fn, ms) => {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
      });
    this.stopVisibility = (options.onVisible ?? browserVisibility)(() => this.onBecameVisible());
  }

  /** Stops listening for visibility and closes the socket. Mainly for tests. */
  dispose(): void {
    this.stopVisibility();
    this.teardown();
  }

  // ------------------------------------------------------------ room lifecycle

  async createRoom(profile: Profile, settings: Partial<RoomSettings> = {}): Promise<void> {
    this.teardown();
    let code: string;
    try {
      const res = await this.doFetch(`${this.httpBase}/rooms`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      code = ((await res.json()) as { code: string }).code;
    } catch {
      this.fail('NETWORK', "Couldn't reach the game server. Check your connection and try again.");
      return;
    }
    await this.startSession(code, profile, null, { maxSeats: DEFAULT_MAX_SEATS, ...settings });
  }

  async joinRoom(code: string, profile: Profile): Promise<void> {
    this.teardown();
    const normalized = normalizeRoomCode(code);
    if (!isValidRoomCode(normalized)) {
      this.fail('ROOM_NOT_FOUND', `No room with code "${code.trim()}"`);
      return;
    }
    const token = await this.store.getItem(rejoinTokenKey(normalized)).catch(() => null);
    await this.startSession(normalized, profile, token, null);
  }

  leave(): Promise<void> {
    // The rejoin token is kept on purpose: typing the code again returns to the same seat.
    this.teardown();
    return Promise.resolve();
  }

  // ------------------------------------------------------------ lobby

  setReady(ready: boolean): Promise<void> {
    this.send({ type: ready ? 'ready' : 'unready' });
    return Promise.resolve();
  }

  updateSettings(settings: Partial<RoomSettings>): Promise<void> {
    const { maxSeats, turnTimer } = settings;
    if (maxSeats === undefined && turnTimer === undefined) return Promise.resolve();
    this.send({
      type: 'settings',
      ...(maxSeats !== undefined ? { maxSeats } : {}),
      ...(turnTimer !== undefined ? { turnTimer } : {}),
    });
    return Promise.resolve();
  }

  start(): Promise<void> {
    this.send({ type: 'start' });
    return Promise.resolve();
  }

  // ------------------------------------------------------------ game

  sendAction(action: IntentAction): Promise<void> {
    this.send({ type: 'intent', action, lastVersion: this.version });
    return Promise.resolve();
  }

  continueRound(): Promise<void> {
    this.send({ type: 'continue' });
    return Promise.resolve();
  }

  rematch(): Promise<void> {
    this.send({ type: 'rematch' });
    return Promise.resolve();
  }

  sendEmote(emoteId: EmoteId): Promise<void> {
    this.send({ type: 'emote', emoteId });
    return Promise.resolve();
  }

  hostDecision(playerId: string, decision: 'wait' | 'skip'): Promise<void> {
    const seat = this.room?.players.some((p) => p.id === playerId) ? seatForPlayerId(playerId) : -1;
    if (seat < 0) this.fail('NO_SUCH_SEAT', 'That player is not in the room');
    else this.send({ type: 'hostDecision', seat, decision });
    return Promise.resolve();
  }

  // ------------------------------------------------------------ subscriptions

  onRoom(listener: (room: RoomState | null) => void): Unsubscribe {
    return this.subscribe(this.listeners.room, listener, () => listener(this.room));
  }

  onView(listener: (view: GameView | null) => void): Unsubscribe {
    return this.subscribe(this.listeners.view, listener, () => listener(this.view));
  }

  onEvents(listener: (events: GameEvent[]) => void): Unsubscribe {
    return this.subscribe(this.listeners.events, listener);
  }

  onEmote(listener: (emote: EmoteEvent) => void): Unsubscribe {
    return this.subscribe(this.listeners.emote, listener);
  }

  onError(listener: (error: ClientError) => void): Unsubscribe {
    return this.subscribe(this.listeners.error, listener);
  }

  onConnection(listener: (state: ConnectionState) => void): Unsubscribe {
    return this.subscribe(this.listeners.connection, listener, () => listener(this.connection));
  }

  // ------------------------------------------------------------ connecting

  /**
   * Starts a session and resolves once the first `welcome` arrives, or the attempt fails for
   * good (the failure has been reported through `onError` by then).
   */
  private startSession(
    code: string,
    profile: Profile,
    token: string | null,
    initialSettings: Partial<RoomSettings> | null,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      this.session = { code, profile, token, joined: false, initialSettings, settle: resolve };
      this.openSocket();
    });
  }

  /** Opens one socket for the current session and wires its events. */
  private openSocket(): void {
    const session = this.session;
    if (!session) return;
    const socket = this.createSocket(`${this.wsBase}/rooms/${session.code}/ws`);
    this.socket = socket;
    let opened = false;
    // Events from a socket we have already replaced or dropped must not touch our state.
    const current = (): boolean => this.socket === socket;

    socket.onopen = () => {
      if (!current()) return;
      opened = true;
      this.sendRaw({
        type: 'join',
        roomCode: session.code,
        name: session.profile.name,
        avatar: session.profile.avatar,
        protocolVersion: PROTOCOL_VERSION,
        ...(session.token ? { rejoinToken: session.token } : {}),
      });
    };
    socket.onmessage = (event) => {
      if (current()) this.onMessage(String(event.data));
    };
    socket.onclose = (event) => {
      if (!current()) return;
      this.socket = null;
      this.cancelPong?.();
      this.cancelPong = null;
      void this.onSocketClosed(session, opened, event.code);
    };
    socket.onerror = () => {
      // A `close` event always follows; handling it there avoids reporting twice.
    };
  }

  private async onSocketClosed(session: Session, opened: boolean, code: number): Promise<void> {
    if (code === REPLACED_CLOSE_CODE) {
      return this.giveUp('REPLACED', 'You joined this room from another tab or device.');
    }
    // A socket that never opened is either a down server or a room that does not exist
    // (the Worker answers 404 to the upgrade). A plain GET tells the two apart.
    if (!opened) {
      const status = await this.probeRoom(session.code);
      if (this.session !== session || this.socket !== null) return; // superseded meanwhile
      if (status === 404) {
        return this.giveUp('ROOM_NOT_FOUND', `No room with code "${session.code}"`);
      }
      if (!session.joined) {
        return this.giveUp('NETWORK', "Couldn't reach the game server. Check your connection.");
      }
    } else if (!session.joined) {
      return this.giveUp('NETWORK', 'The connection closed before you could join the room.');
    }
    this.setConnection('reconnecting');
    this.scheduleReconnect();
  }

  /**
   * Asks the server about a room with a plain `GET /rooms/:code/ws`. Returns 404 only when it
   * is the room server itself saying "Room not found" (some other service answering on the
   * port must not look like an expired room); null if unreachable; else the HTTP status.
   */
  private async probeRoom(code: string): Promise<number | null> {
    try {
      const res = await this.doFetch(`${this.httpBase}/rooms/${code}/ws`);
      if (res.status !== 404) return res.status;
      return (await res.text()).startsWith(ROOM_NOT_FOUND_BODY) ? 404 : 502;
    } catch {
      return null;
    }
  }

  private scheduleReconnect(): void {
    this.cancelRetry?.();
    const last = RECONNECT_DELAYS_MS.length - 1;
    const delay = RECONNECT_DELAYS_MS[Math.min(this.attempt, last)] as number;
    this.attempt += 1;
    this.cancelRetry = this.schedule(() => {
      this.cancelRetry = null;
      this.openSocket();
    }, delay);
  }

  /** Drops whatever socket we have and reconnects right now, skipping any backoff wait. */
  private reconnectNow(): void {
    if (!this.session?.joined) return;
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.cancelPong?.();
    this.cancelPong = null;
    const old = this.socket;
    this.socket = null; // marks the old socket stale before it reports closing
    old?.close();
    this.attempt = 0;
    this.setConnection('reconnecting');
    this.openSocket();
  }

  /** Page became visible: check the socket is really alive, since sockets can die silently. */
  private onBecameVisible(): void {
    const session = this.session;
    if (!session?.joined) return;
    const socket = this.socket;
    if (!socket || socket.readyState !== SOCKET_OPEN) {
      this.reconnectNow();
      return;
    }
    this.cancelPong?.();
    socket.send(PING);
    this.cancelPong = this.schedule(() => {
      this.cancelPong = null;
      if (this.socket === socket) this.reconnectNow();
    }, PONG_TIMEOUT_MS);
  }

  // ------------------------------------------------------------ incoming messages

  private onMessage(text: string): void {
    if (text === PONG) {
      this.cancelPong?.();
      this.cancelPong = null;
      return;
    }
    let message: ServerMessage;
    try {
      message = JSON.parse(text) as ServerMessage;
    } catch {
      return;
    }
    switch (message.type) {
      case 'welcome':
        return this.onWelcome(message);
      case 'roomUpdate':
        return this.applyRoom(message.room);
      case 'events':
        // Events at or below the version we hold were already applied (e.g. after a resync).
        if (message.version <= this.version) return;
        this.version = message.version;
        this.listeners.events.forEach((l) => l(message.events));
        return this.setView(message.view);
      case 'view':
        if (message.version < this.version) return;
        this.version = message.version;
        return this.setView(message.view);
      case 'emote':
        return this.listeners.emote.forEach((l) =>
          l({ playerId: playerIdForSeat(message.seat), emote: message.emoteId }),
        );
      case 'error':
        return this.onServerError(message);
      case 'presence':
        // `roomUpdate` follows every presence change and carries the same information.
        return;
    }
  }

  private onWelcome(message: Extract<ServerMessage, { type: 'welcome' }>): void {
    const session = this.session;
    if (!session) return;
    this.selfId = playerIdForSeat(message.seat);
    if (message.rejoinToken) {
      session.token = message.rejoinToken;
      void this.store.setItem(rejoinTokenKey(session.code), message.rejoinToken).catch(() => {});
    }
    const firstWelcome = !session.joined;
    session.joined = true;
    this.attempt = 0;
    this.setConnection('online');

    // Room first (so the UI knows who "you" are), then events, then the view they led to.
    this.version = message.version;
    this.applyRoom(message.room);
    if (message.lastRoundScored)
      this.listeners.events.forEach((l) => l([message.lastRoundScored!]));
    this.setView(message.view);

    if (firstWelcome && session.initialSettings && message.seat === message.room.hostSeat) {
      // Only what differs from the new room's defaults needs sending.
      const { maxSeats, turnTimer } = session.initialSettings;
      void this.updateSettings({
        ...(maxSeats !== undefined && maxSeats !== message.room.maxSeats ? { maxSeats } : {}),
        ...(turnTimer !== undefined && turnTimer !== message.room.turnTimer ? { turnTimer } : {}),
      });
    }
    session.settle?.();
    session.settle = null;
  }

  private onServerError(message: Extract<ServerMessage, { type: 'error' }>): void {
    const session = this.session;
    const code =
      message.code === 'ENGINE'
        ? ((message.engineCode ?? 'INVALID_ACTION') as ClientError['code'])
        : (ERROR_CODES[message.code] ?? 'BAD_MESSAGE');
    const text = describeError(message.code, message.message);

    // Errors before the first welcome mean the join itself was refused.
    if (session && !session.joined && JOIN_FAILURES.has(message.code)) {
      if (message.code === 'BAD_TOKEN') void this.forgetToken(session.code);
      return this.giveUp(code, text);
    }
    if (session?.joined && message.code === 'PROTOCOL_VERSION') return this.giveUp(code, text);
    this.fail(code, text);
  }

  // ------------------------------------------------------------ state publishing

  /** Converts the wire `RoomInfo` to the UI's `RoomState` and publishes it. */
  private applyRoom(info: RoomInfo): void {
    const players: RoomPlayer[] = [...info.players]
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: playerIdForSeat(p.seat),
        name: p.name,
        avatar: p.avatar,
        ready: p.ready,
        isHost: p.seat === info.hostSeat,
        connected: p.connected,
        skipped: p.skipped,
      }));
    this.room = {
      code: info.code,
      selfId: this.selfId,
      hostId: playerIdForSeat(info.hostSeat),
      phase: info.status === 'game' ? 'inGame' : 'lobby',
      settings: { maxSeats: info.maxSeats, turnTimer: info.turnTimer },
      turnDeadline: info.turnDeadline,
      players,
      continuedIds: info.continued.map(playerIdForSeat),
      pause: info.pause
        ? {
            awayIds: info.pause.seats.map(playerIdForSeat),
            deadline: info.pause.deadline,
            expired: info.pause.expired,
          }
        : null,
    };
    // A rematch returns to the lobby without sending a view; drop the finished game's one.
    if (info.status === 'lobby' && this.view !== null) this.setView(null);
    this.listeners.room.forEach((l) => l(this.room));
  }

  private setView(view: GameView | null): void {
    this.view = view;
    this.listeners.view.forEach((l) => l(view));
  }

  private setConnection(state: ConnectionState): void {
    if (this.connection === state) return;
    this.connection = state;
    this.listeners.connection.forEach((l) => l(state));
  }

  // ------------------------------------------------------------ helpers

  /** Sends a message, or tells the player we are offline. */
  private send(message: ClientMessage): void {
    if (!this.session) {
      this.fail('NOT_IN_ROOM', 'You are not in a room');
    } else if (!this.session.joined || this.socket?.readyState !== SOCKET_OPEN) {
      this.fail('NETWORK', 'Reconnecting… try again in a moment.');
    } else {
      this.sendRaw(message);
    }
  }

  private sendRaw(message: ClientMessage): void {
    this.socket?.send(JSON.stringify(message));
  }

  private async forgetToken(code: string): Promise<void> {
    await this.store.setItem(rejoinTokenKey(code), '').catch(() => {});
  }

  /** Ends the session for good after a failure, reports it, and returns to "no room". */
  private giveUp(code: ClientError['code'], message: string): void {
    const settle = this.session?.settle;
    this.teardown();
    this.fail(code, message);
    settle?.();
  }

  /** Closes the socket, cancels timers and clears all room state (no error is reported). */
  private teardown(): void {
    const socket = this.socket;
    const settle = this.session?.settle;
    this.socket = null;
    this.session = null;
    this.cancelRetry?.();
    this.cancelPong?.();
    this.cancelRetry = null;
    this.cancelPong = null;
    this.attempt = 0;
    socket?.close(1000, 'leaving');
    this.setConnection('online');
    const hadRoom = this.room !== null;
    const hadView = this.view !== null;
    this.room = null;
    this.view = null;
    this.version = 0;
    this.selfId = '';
    if (hadView) this.listeners.view.forEach((l) => l(null));
    if (hadRoom) this.listeners.room.forEach((l) => l(null));
    settle?.();
  }

  private fail(code: ClientError['code'], message: string): void {
    this.listeners.error.forEach((l) => l({ code, message }));
  }

  private subscribe<T>(set: Set<T>, listener: T, replay?: () => void): Unsubscribe {
    set.add(listener);
    replay?.();
    return () => {
      set.delete(listener);
    };
  }
}

/** Player-facing wording for server errors whose raw text is too technical. */
function describeError(code: string, serverMessage: string): string {
  switch (code) {
    case 'PROTOCOL_VERSION':
      return `This app is out of date and can't talk to the server (app protocol ${PROTOCOL_VERSION}; ${serverMessage.toLowerCase()}). Reload the page or update the app.`;
    case 'ROOM_STARTED':
      return 'That game has already started, and this device is not one of its players.';
    case 'BAD_TOKEN':
      return 'Your seat in that room is no longer available.';
    case 'PAUSED':
      return 'The game is paused until the missing player returns.';
    default:
      return serverMessage;
  }
}

/** `visibilitychange` → visible on web; a no-op elsewhere. */
function browserVisibility(listener: () => void): Unsubscribe {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc?.addEventListener) return () => {};
  const handler = (): void => {
    if (doc.visibilityState === 'visible') listener();
  };
  doc.addEventListener('visibilitychange', handler);
  return () => doc.removeEventListener('visibilitychange', handler);
}
