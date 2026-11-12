/**
 * One Durable Object per room. It owns the lobby, the authoritative `GameState`, the
 * connected sockets, and all timers. Memory is wiped on hibernation, so everything that
 * matters lives in storage and is reloaded in the constructor.
 */

import { DurableObject } from 'cloudflare:workers';
import {
  applyAction,
  createGame,
  redactEvents,
  viewFor,
  type Action,
  type ActionResult,
  type GameEvent,
  type GameState,
} from '@five-kingdoms/engine';
import {
  PING,
  PONG,
  PROTOCOL_VERSION,
  parseClientMessage,
  MAX_MESSAGE_CHARS,
  type ClientMessage,
  type ErrorCode,
  type RoundScoredEvent,
  type ServerMessage,
} from '@five-kingdoms/protocol';
import { pickAutoMove } from './autoplay';
import { DEFAULT_EXPIRY_MS, DEFAULT_GRACE_MS, msSetting, type Env } from './env';
import { allowAction } from './rate-limit';
import {
  newRoomState,
  nextHost,
  playerIdForSeat,
  toRoomInfo,
  type RoomState,
  type StoredPlayer,
} from './room-state';
import { clearDeadline, nextAlarmTime, setDeadline, takeDue, type Schedule } from './schedule';
import { generateToken, hashToken, hashesEqual } from './token';

/** What each socket remembers across hibernation. `seat` is null until it has joined. */
interface Attachment {
  seat: number | null;
}

const PAUSE = 'pause';
const EXPIRY = 'expiry';
/** Safety bound on automatic moves in one pass (a full 11-round game is far below this). */
const MAX_AUTO_STEPS = 2000;
const OPEN = 1;

export class Room extends DurableObject<Env> {
  private room: RoomState | null = null;
  private game: GameState | null = null;
  private schedule: Schedule = [];
  /** Emote rate limiting. Kept in memory only; a hibernation just resets it. */
  private lastEmote = new Map<number, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<RoomState | GameState | Schedule>([
        'room',
        'game',
        'schedule',
      ]);
      this.room = (stored.get('room') as RoomState | undefined) ?? null;
      this.game = (stored.get('game') as GameState | undefined) ?? null;
      this.schedule = (stored.get('schedule') as Schedule | undefined) ?? [];
    });
  }

  // ------------------------------------------------------------------ entry points

  /** Called by the Worker (via RPC) to claim a room code. Returns false if it is taken. */
  async create(code: string): Promise<boolean> {
    if (this.room) return false;
    this.room = newRoomState(code);
    this.game = null;
    this.schedule = setDeadline([], EXPIRY, Date.now() + this.expiryMs());
    await this.persist();
    return true;
  }

  /** Accepts a WebSocket upgrade. Unknown or expired rooms are a 404. */
  override async fetch(request: Request): Promise<Response> {
    if (!this.room) return new Response('Room not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat: null } satisfies Attachment);
    // A new socket cancels pending expiry.
    this.schedule = clearDeadline(this.schedule, EXPIRY);
    await this.persist();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.room) return;
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_CHARS) {
      return this.sendError(ws, 'BAD_MESSAGE', 'Messages must be JSON text under 8 KB');
    }
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) return this.sendError(ws, 'BAD_MESSAGE', parsed.error);
    await this.dispatch(ws, parsed.message);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  /** Runs the earliest due deadline(s): end of a disconnect grace period, or room expiry. */
  override async alarm(): Promise<void> {
    if (!this.room) return;
    const { due, rest } = takeDue(this.schedule, Date.now());
    this.schedule = rest;
    for (const deadline of due) {
      if (deadline.id === EXPIRY && this.openSockets().length === 0) return this.expire();
      if (deadline.id === PAUSE && this.room.pause) this.room.pause.expired = true;
    }
    await this.persist();
    this.broadcastRoom();
  }

  // ------------------------------------------------------------------ dispatch

  private async dispatch(ws: WebSocket, msg: ClientMessage): Promise<void> {
    if (msg.type === 'join') return this.onJoin(ws, msg);
    const seat = this.seatOf(ws);
    if (seat === null) return this.sendError(ws, 'NOT_JOINED', 'Send join first');

    switch (msg.type) {
      case 'ready':
      case 'unready':
        return this.onReady(ws, seat, msg.type === 'ready');
      case 'settings':
        return this.onSettings(ws, seat, msg.maxSeats);
      case 'start':
        return this.onStart(ws, seat);
      case 'intent':
        return this.onIntent(ws, seat, msg.action, msg.lastVersion);
      case 'continue':
        return this.onContinue(ws, seat);
      case 'emote':
        return this.onEmote(ws, seat, msg.emoteId);
      case 'hostDecision':
        return this.onHostDecision(ws, seat, msg.seat, msg.decision);
      case 'rematch':
        return this.onRematch(ws, seat);
    }
  }

  // ------------------------------------------------------------------ lobby

  private async onJoin(ws: WebSocket, msg: Extract<ClientMessage, { type: 'join' }>) {
    const room = this.room as RoomState;
    if (this.seatOf(ws) !== null) return this.sendError(ws, 'ALREADY_JOINED', 'Already joined');
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      return this.sendError(ws, 'PROTOCOL_VERSION', `Server speaks protocol ${PROTOCOL_VERSION}`);
    }
    if (msg.roomCode !== room.code) return this.sendError(ws, 'BAD_MESSAGE', 'Wrong room code');

    // Hash first: after this await, everything below runs without interleaving.
    const hash = msg.rejoinToken ? await hashToken(msg.rejoinToken) : null;
    if (this.seatOf(ws) !== null) return this.sendError(ws, 'ALREADY_JOINED', 'Already joined');

    let seat: number;
    let rejoinToken: string | null = null;
    if (hash !== null) {
      const known = room.players.find((p) => hashesEqual(p.tokenHash, hash));
      if (!known) return this.sendError(ws, 'BAD_TOKEN', 'Unknown rejoin token');
      seat = known.seat;
      known.skipped = false; // a returning player plays normally again
      for (const old of this.socketsOfSeat(seat)) old.close(4001, 'Replaced by a newer connection');
    } else {
      if (room.status !== 'lobby') {
        return this.sendError(ws, 'ROOM_STARTED', 'The game has started; rejoin with your token');
      }
      if (room.players.length >= room.maxSeats) {
        return this.sendError(ws, 'ROOM_FULL', 'The room is full');
      }
      seat = room.players.length;
      rejoinToken = generateToken();
      room.players.push({
        seat,
        name: msg.name,
        avatar: msg.avatar,
        ready: false,
        skipped: false,
        tokenHash: await hashToken(rejoinToken),
      });
    }

    ws.serializeAttachment({ seat } satisfies Attachment);
    this.schedule = clearDeadline(this.schedule, EXPIRY);
    this.send(ws, {
      type: 'welcome',
      seat,
      rejoinToken,
      room: this.roomInfo(),
      view: this.game ? viewFor(this.game, playerIdForSeat(seat)) : null,
      version: room.version,
      ...this.scoredFor(seat),
    });
    this.broadcast({ type: 'presence', seat, connected: true, deadline: null }, ws);
    await this.reconcile();
  }

  private async onReady(ws: WebSocket, seat: number, ready: boolean) {
    if (!this.requireStatus(ws, 'lobby')) return;
    this.playerAt(seat).ready = ready;
    await this.persist();
    this.broadcastRoom();
  }

  private async onSettings(ws: WebSocket, seat: number, maxSeats: number) {
    const room = this.room as RoomState;
    if (!this.requireHost(ws, seat) || !this.requireStatus(ws, 'lobby')) return;
    if (maxSeats < room.players.length) {
      return this.sendError(ws, 'INVALID_SETTINGS', 'Fewer seats than players already joined');
    }
    room.maxSeats = maxSeats;
    await this.persist();
    this.broadcastRoom();
  }

  private async onStart(ws: WebSocket, seat: number) {
    const room = this.room as RoomState;
    if (!this.requireHost(ws, seat) || !this.requireStatus(ws, 'lobby')) return;
    if (room.players.length < 2) {
      return this.sendError(ws, 'NOT_ENOUGH_PLAYERS', 'At least 2 players are needed');
    }
    const connected = this.connectedSeats();
    if (!room.players.every((p) => p.ready && connected.has(p.seat))) {
      return this.sendError(ws, 'NOT_ALL_READY', 'Every player must be connected and ready');
    }

    const seed = crypto.getRandomValues(new Uint32Array(1))[0] as number;
    this.game = createGame({
      seed,
      players: room.players.map((p) => ({ id: playerIdForSeat(p.seat), name: p.name })),
      rules: { maxSeats: room.maxSeats },
    });
    room.status = 'game';
    room.continued = [];
    const first = applyAction(this.game, playerIdForSeat(0), { type: 'startNextRound' });
    this.broadcastRoom();
    await this.commit(first);
    await this.reconcile();
  }

  private async onRematch(ws: WebSocket, seat: number) {
    const room = this.room as RoomState;
    if (!this.requireHost(ws, seat)) return;
    if (this.game?.phase !== 'gameOver') {
      return this.sendError(ws, 'BAD_STATE', 'A rematch is only possible after the game ends');
    }
    this.game = null;
    room.status = 'lobby';
    room.continued = [];
    room.lastRoundScored = null;
    room.pause = null;
    this.schedule = clearDeadline(this.schedule, PAUSE);
    for (const p of room.players) {
      p.ready = false;
      p.skipped = false;
    }
    await this.persist();
    this.broadcastRoom();
  }

  // ------------------------------------------------------------------ game

  private async onIntent(ws: WebSocket, seat: number, action: Action, lastVersion: number) {
    const room = this.room as RoomState;
    if (!this.game || room.status !== 'game') {
      return this.sendError(ws, 'BAD_STATE', 'No game in progress');
    }
    if (room.pause) return this.sendError(ws, 'PAUSED', 'The game is paused');
    const versionBefore = room.version;

    const result = applyAction(this.game, playerIdForSeat(seat), action);
    if (!result.ok) {
      this.sendError(ws, 'ENGINE', result.error.message, result.error.code);
    } else {
      await this.commit(result);
      await this.reconcile();
    }
    // The client was behind: give it the full view so it can resync.
    if (lastVersion !== versionBefore) this.sendView(ws, seat);
  }

  private async onContinue(ws: WebSocket, seat: number) {
    const room = this.room as RoomState;
    if (this.game?.phase !== 'roundOver') {
      return this.sendError(ws, 'BAD_STATE', 'There is no scoreboard to continue from');
    }
    if (!room.continued.includes(seat)) room.continued.push(seat);
    await this.reconcile();
  }

  private async onHostDecision(
    ws: WebSocket,
    seat: number,
    target: number,
    decision: 'wait' | 'skip',
  ) {
    const room = this.room as RoomState;
    if (!this.requireHost(ws, seat)) return;
    if (!room.pause?.expired) {
      return this.sendError(ws, 'BAD_STATE', 'The grace period has not ended');
    }
    if (!this.awaySeats().includes(target)) {
      return this.sendError(ws, 'NO_SUCH_SEAT', 'That seat is not away');
    }
    if (decision === 'wait') {
      room.pause = { deadline: Date.now() + this.graceMs(), expired: false };
      this.schedule = setDeadline(this.schedule, PAUSE, room.pause.deadline);
    } else {
      this.playerAt(target).skipped = true;
    }
    await this.reconcile();
  }

  private onEmote(ws: WebSocket, seat: number, emoteId: ClientEmote) {
    if (!allowAction(this.lastEmote, seat, Date.now())) {
      return this.sendError(ws, 'RATE_LIMITED', 'Too many emotes');
    }
    this.broadcast({ type: 'emote', seat, emoteId });
  }

  /**
   * Stores an accepted engine result: new state, version bump, then per-seat redacted
   * events plus view. Persists before anyone is told.
   */
  private async commit(result: ActionResult): Promise<void> {
    const room = this.room as RoomState;
    if (!result.ok) throw new Error(`engine rejected a server-driven action: ${result.error.code}`);
    this.game = result.state;
    room.version += 1;
    for (const e of result.events) {
      if (e.type === 'roundScored') room.lastRoundScored = e;
      else if (e.type === 'roundStarted') room.lastRoundScored = null;
    }
    if (
      result.state.phase === 'roundOver' ||
      result.events.some((e) => e.type === 'roundStarted')
    ) {
      room.continued = [];
    }
    await this.persist();
    this.broadcastEvents(result.events);
  }

  // ------------------------------------------------------------------ pause, autoplay, rounds

  /** Seats the game is waiting for: not connected and not skipped. Empty outside a game. */
  private awaySeats(excluding?: WebSocket): number[] {
    const room = this.room;
    if (!room || room.status !== 'game') return [];
    const connected = this.connectedSeats(excluding);
    return room.players.filter((p) => !connected.has(p.seat) && !p.skipped).map((p) => p.seat);
  }

  /** Starts or ends the pause so it matches who is away. */
  private syncPause(): void {
    const room = this.room as RoomState;
    const inTurn = this.game?.phase === 'awaitingDraw' || this.game?.phase === 'awaitingDiscard';
    if (!inTurn || this.awaySeats().length === 0) {
      room.pause = null;
      this.schedule = clearDeadline(this.schedule, PAUSE);
    } else if (!room.pause) {
      room.pause = { deadline: Date.now() + this.graceMs(), expired: false };
      this.schedule = setDeadline(this.schedule, PAUSE, room.pause.deadline);
    }
  }

  /** Starts the next round once every connected player has pressed continue. */
  private async maybeAdvanceRound(): Promise<void> {
    const room = this.room as RoomState;
    if (this.game?.phase !== 'roundOver') return;
    const connected = [...this.connectedSeats()];
    if (connected.length === 0 || !connected.every((s) => room.continued.includes(s))) return;
    await this.commit(applyAction(this.game, playerIdForSeat(0), { type: 'startNextRound' }));
  }

  /** Plays turns for skipped seats until the game needs a human again or is paused. */
  private async autoPlay(): Promise<void> {
    for (let step = 0; step < MAX_AUTO_STEPS; step++) {
      this.syncPause();
      const room = this.room as RoomState;
      const game = this.game;
      if (!game || room.pause) return;
      const move = pickAutoMove(game);
      const mover = room.players[game.currentIndex];
      if (!move || !mover?.skipped) return;
      const result = move.candidates
        .map((action) => applyAction(game, move.playerId, action))
        .find((r) => r.ok);
      if (!result) return;
      await this.commit(result);
    }
  }

  /** After any change in who is here: advance rounds, auto-play, save, tell everyone. */
  private async reconcile(): Promise<void> {
    await this.maybeAdvanceRound();
    await this.autoPlay();
    this.syncPause();
    await this.persist();
    this.broadcastRoom();
  }

  // ------------------------------------------------------------------ disconnects and expiry

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    const room = this.room;
    if (!room) return;
    const seat = this.seatOf(ws);
    const stillOpen = this.openSockets(ws);

    if (seat !== null && !this.connectedSeats(ws).has(seat)) {
      if (seat === room.hostSeat) {
        const next = nextHost(
          room.hostSeat,
          room.players.map((p) => p.seat),
          this.connectedSeats(ws),
        );
        if (next !== null) room.hostSeat = next;
      }
      this.syncPause();
      this.broadcast(
        { type: 'presence', seat, connected: false, deadline: room.pause?.deadline ?? null },
        ws,
      );
    }
    if (stillOpen.length === 0) {
      this.schedule = setDeadline(this.schedule, EXPIRY, Date.now() + this.expiryMs());
    }
    await this.reconcile();
  }

  /** Deletes the room: no one is connected and the idle period is over. */
  private async expire(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.room = null;
    this.game = null;
    this.schedule = [];
  }

  // ------------------------------------------------------------------ sockets and sending

  private openSockets(exclude?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((s) => s !== exclude && s.readyState === OPEN);
  }

  private seatOf(ws: WebSocket): number | null {
    return (ws.deserializeAttachment() as Attachment | null)?.seat ?? null;
  }

  private socketsOfSeat(seat: number): WebSocket[] {
    return this.openSockets().filter((s) => this.seatOf(s) === seat);
  }

  /** Seats with at least one open socket. */
  private connectedSeats(exclude?: WebSocket): Set<number> {
    const seats = new Set<number>();
    for (const s of this.openSockets(exclude)) {
      const seat = this.seatOf(s);
      if (seat !== null) seats.add(seat);
    }
    return seats;
  }

  private playerAt(seat: number): StoredPlayer {
    return (this.room as RoomState).players.find((p) => p.seat === seat) as StoredPlayer;
  }

  private roomInfo() {
    return toRoomInfo(this.room as RoomState, this.connectedSeats(), this.awaySeats());
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // The socket is already gone; its close event will clean up.
    }
  }

  private sendError(ws: WebSocket, code: ErrorCode, message: string, engineCode?: string): void {
    this.send(ws, {
      type: 'error',
      code,
      message,
      ...(engineCode !== undefined ? { engineCode } : {}),
    });
  }

  /**
   * `{ lastRoundScored }` for a welcome when the table is at a scoreboard, else nothing.
   * Redacted like any other event, so it stays correct if scoring ever hides information.
   */
  private scoredFor(seat: number): { lastRoundScored?: RoundScoredEvent } {
    const scored = this.room?.lastRoundScored;
    const phase = this.game?.phase;
    if (!scored || (phase !== 'roundOver' && phase !== 'gameOver')) return {};
    const [event] = redactEvents([scored], playerIdForSeat(seat));
    return event?.type === 'roundScored' ? { lastRoundScored: event } : {};
  }

  private sendView(ws: WebSocket, seat: number): void {
    if (!this.game || !this.room) return;
    this.send(ws, {
      type: 'view',
      view: viewFor(this.game, playerIdForSeat(seat)),
      version: this.room.version,
    });
  }

  /** Sends to every joined socket, except `except`. */
  private broadcast(message: ServerMessage, except?: WebSocket): void {
    for (const s of this.openSockets()) {
      if (s !== except && this.seatOf(s) !== null) this.send(s, message);
    }
  }

  private broadcastRoom(): void {
    if (this.room) this.broadcast({ type: 'roomUpdate', room: this.roomInfo() });
  }

  /** Each seat gets only its own redacted events and its own view. */
  private broadcastEvents(events: GameEvent[]): void {
    const game = this.game;
    const room = this.room;
    if (!game || !room) return;
    for (const s of this.openSockets()) {
      const seat = this.seatOf(s);
      if (seat === null) continue;
      const id = playerIdForSeat(seat);
      this.send(s, {
        type: 'events',
        events: redactEvents(events, id),
        view: viewFor(game, id),
        version: room.version,
      });
    }
  }

  private requireHost(ws: WebSocket, seat: number): boolean {
    if ((this.room as RoomState).hostSeat === seat) return true;
    this.sendError(ws, 'NOT_HOST', 'Only the host can do that');
    return false;
  }

  private requireStatus(ws: WebSocket, status: RoomState['status']): boolean {
    if ((this.room as RoomState).status === status) return true;
    this.sendError(
      ws,
      'BAD_STATE',
      `Not allowed while the room is in ${(this.room as RoomState).status}`,
    );
    return false;
  }

  // ------------------------------------------------------------------ storage and timers

  private graceMs(): number {
    return msSetting(this.env.GRACE_MS, DEFAULT_GRACE_MS);
  }

  private expiryMs(): number {
    return msSetting(this.env.EXPIRY_MS, DEFAULT_EXPIRY_MS);
  }

  /** Writes room, game and schedule in one transaction, then points the alarm at the earliest deadline. */
  private async persist(): Promise<void> {
    if (!this.room) return;
    await this.ctx.storage.put({
      room: this.room,
      schedule: this.schedule,
      ...(this.game ? { game: this.game } : {}),
    });
    if (!this.game) await this.ctx.storage.delete('game');
    const next = nextAlarmTime(this.schedule);
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }
}

type ClientEmote = Extract<ClientMessage, { type: 'emote' }>['emoteId'];
