/**
 * DEVELOPMENT HARNESS ONLY. Runs the rules engine in memory with auto-playing opponents so
 * the whole flow (menu to final standings) can be played alone in a browser.
 * It is not a product feature and is replaced by a WebSocket client later.
 *
 * Create: you are the host and 1-6 dev opponents are already ready in the lobby.
 * Join: any well-formed room code "finds" a room hosted by a dev opponent, who starts the
 * game by themselves once everyone is ready.
 */

import {
  applyAction,
  createGame,
  redactEvents,
  viewFor,
  type Action,
  type GameEvent,
  type GameState,
  type GameView,
} from '@five-kingdoms/engine';
import { AVATARS } from '../design/avatars';
import { devBotAction } from './devBot';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  isValidRoomCode,
  normalizeRoomCode,
  type ClientError,
  type ConnectionState,
  type EmoteEvent,
  type EmoteId,
  type GameClient,
  type Profile,
  type RoomPlayer,
  type RoomSettings,
  type RoomState,
  type Unsubscribe,
} from './GameClient';

export const LOCAL_PLAYER_ID = 'you';
const BOT_NAMES = ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme', 'Finn'];
const MAX_OPPONENTS = 6;

export interface LocalGameClientOptions {
  /** Dev opponents to seat besides you (1-6). Default 3. */
  opponents?: number;
  /** Pause before each opponent move in ms. 0 plays them synchronously (used by tests). */
  opponentDelayMs?: number;
  /** Source of randomness for room codes and the game seed. */
  random?: () => number;
  /** Timer hook so tests can control time. Returns a cancel function. */
  schedule?: (fn: () => void, ms: number) => () => void;
}

/** Extra controls only the dev harness has. */
export interface DevHarness {
  /** How many dev opponents the next created or joined room starts with (1-6). */
  setOpponentCount(count: number): void;
  addDevOpponent(): void;
  removeDevOpponent(): void;
}

/** True for clients that support the dev-opponent controls (only `LocalGameClient`). */
export function isDevHarness(client: GameClient): client is GameClient & DevHarness {
  return (
    'setOpponentCount' in client && 'addDevOpponent' in client && 'removeDevOpponent' in client
  );
}

type Listeners = {
  room: Set<(room: RoomState | null) => void>;
  view: Set<(view: GameView | null) => void>;
  events: Set<(events: GameEvent[]) => void>;
  emote: Set<(emote: EmoteEvent) => void>;
  error: Set<(error: ClientError) => void>;
  connection: Set<(state: ConnectionState) => void>;
};

export class LocalGameClient implements GameClient, DevHarness {
  private room: RoomState | null = null;
  private game: GameState | null = null;
  private profile: Profile = { name: 'You', avatar: 'fox' };
  private opponentCount: number;
  private readonly delay: number;
  private readonly random: () => number;
  private readonly schedule: (fn: () => void, ms: number) => () => void;
  private cancelPending: (() => void) | null = null;
  private readonly listeners: Listeners = {
    room: new Set(),
    view: new Set(),
    events: new Set(),
    emote: new Set(),
    error: new Set(),
    connection: new Set(),
  };

  constructor(options: LocalGameClientOptions = {}) {
    this.opponentCount = clamp(options.opponents ?? 3, 1, MAX_OPPONENTS);
    this.delay = options.opponentDelayMs ?? 650;
    this.random = options.random ?? Math.random;
    this.schedule =
      options.schedule ??
      ((fn, ms) => {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
      });
  }

  // ------------------------------------------------------------ room lifecycle

  createRoom(profile: Profile, settings: Partial<RoomSettings> = {}): Promise<void> {
    this.reset();
    this.profile = profile;
    const maxSeats = clamp(settings.maxSeats ?? Math.max(4, this.opponentCount + 1), 2, 7);
    const code = this.randomCode();
    const players = [
      this.selfPlayer(true),
      ...this.makeBots(Math.min(this.opponentCount, maxSeats - 1), 0),
    ];
    this.room = {
      code,
      selfId: LOCAL_PLAYER_ID,
      hostId: LOCAL_PLAYER_ID,
      phase: 'lobby',
      settings: { maxSeats, turnTimer: settings.turnTimer ?? false },
      players,
      turnDeadline: null,
      pause: null,
      continuedIds: [],
    };
    this.publishRoom();
    return Promise.resolve();
  }

  joinRoom(code: string, profile: Profile): Promise<void> {
    this.reset();
    const normalized = normalizeRoomCode(code);
    if (!isValidRoomCode(normalized)) {
      this.fail('ROOM_NOT_FOUND', `No room with code "${code.trim()}"`);
      return Promise.resolve();
    }
    this.profile = profile;
    const bots = this.makeBots(this.opponentCount, 0);
    const host = bots[0] as RoomPlayer;
    host.isHost = true;
    this.room = {
      code: normalized,
      selfId: LOCAL_PLAYER_ID,
      hostId: host.id,
      phase: 'lobby',
      settings: { maxSeats: clamp(bots.length + 1, 2, 7), turnTimer: false },
      players: [...bots, this.selfPlayer(false)],
      turnDeadline: null,
      pause: null,
      continuedIds: [],
    };
    this.publishRoom();
    return Promise.resolve();
  }

  leave(): Promise<void> {
    this.reset();
    return Promise.resolve();
  }

  // ------------------------------------------------------------ lobby

  setReady(ready: boolean): Promise<void> {
    const room = this.requireLobby();
    if (!room) return Promise.resolve();
    this.patchPlayer(LOCAL_PLAYER_ID, { ready });
    this.maybeBotHostStarts();
    return Promise.resolve();
  }

  updateSettings(settings: Partial<RoomSettings>): Promise<void> {
    const room = this.requireLobby();
    if (!room) return Promise.resolve();
    if (room.hostId !== LOCAL_PLAYER_ID) {
      this.fail('NOT_HOST', 'Only the host can change settings');
      return Promise.resolve();
    }
    const maxSeats = settings.maxSeats ?? room.settings.maxSeats;
    if (!Number.isInteger(maxSeats) || maxSeats < 2 || maxSeats > 7) {
      this.fail('BAD_SETTINGS', 'Seats must be between 2 and 7');
      return Promise.resolve();
    }
    // Dev convenience: drop surplus opponents rather than refusing the change.
    const players = room.players.slice(0, maxSeats);
    this.opponentCount = Math.max(1, players.length - 1);
    // The harness remembers the turn timer setting but never runs a clock: there is no server.
    const turnTimer = settings.turnTimer ?? room.settings.turnTimer;
    this.room = { ...room, settings: { maxSeats, turnTimer }, players };
    this.publishRoom();
    return Promise.resolve();
  }

  start(): Promise<void> {
    const room = this.requireLobby();
    if (!room) return Promise.resolve();
    if (room.hostId !== LOCAL_PLAYER_ID) {
      this.fail('NOT_HOST', 'Only the host can start the game');
    } else {
      this.startGame(room);
    }
    return Promise.resolve();
  }

  // ------------------------------------------------------------ game

  sendAction(action: Exclude<Action, { type: 'startNextRound' }>): Promise<void> {
    if (!this.game) {
      this.fail('WRONG_ROOM_PHASE', 'No game is running');
    } else if ((action as Action).type === 'startNextRound') {
      this.fail('INVALID_ACTION', 'Use continueRound to start the next round');
    } else {
      this.apply(LOCAL_PLAYER_ID, action);
      this.pumpBots();
    }
    return Promise.resolve();
  }

  continueRound(): Promise<void> {
    if (this.game?.phase !== 'roundOver') {
      this.fail('WRONG_PHASE', 'The round is not over');
    } else {
      this.apply(LOCAL_PLAYER_ID, { type: 'startNextRound' });
      this.pumpBots();
    }
    return Promise.resolve();
  }

  rematch(): Promise<void> {
    const room = this.room;
    if (!room || this.game?.phase !== 'gameOver') {
      this.fail('WRONG_ROOM_PHASE', 'The game is not over');
      return Promise.resolve();
    }
    this.cancelTimer();
    this.game = null;
    this.room = {
      ...room,
      phase: 'lobby',
      players: room.players.map((p) => ({ ...p, ready: p.id !== LOCAL_PLAYER_ID })),
    };
    this.publishView();
    this.publishRoom();
    this.maybeBotHostStarts();
    return Promise.resolve();
  }

  sendEmote(emote: EmoteId): Promise<void> {
    if (this.room) this.listeners.emote.forEach((l) => l({ playerId: LOCAL_PLAYER_ID, emote }));
    return Promise.resolve();
  }

  hostDecision(): Promise<void> {
    this.fail('WRONG_ROOM_PHASE', 'Nobody is ever away in the dev harness');
    return Promise.resolve();
  }

  // ------------------------------------------------------------ subscriptions

  onRoom(listener: (room: RoomState | null) => void): Unsubscribe {
    return this.subscribe(this.listeners.room, listener, () => listener(this.room));
  }

  onView(listener: (view: GameView | null) => void): Unsubscribe {
    return this.subscribe(this.listeners.view, listener, () => listener(this.currentView()));
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
    return this.subscribe(this.listeners.connection, listener, () => listener('online'));
  }

  // ------------------------------------------------------------ dev harness

  setOpponentCount(count: number): void {
    this.opponentCount = clamp(count, 1, MAX_OPPONENTS);
  }

  addDevOpponent(): void {
    const room = this.requireLobby();
    if (!room || room.players.length >= room.settings.maxSeats) return;
    const bot = this.makeBots(1, room.players.length)[0] as RoomPlayer;
    this.opponentCount = room.players.length;
    this.room = { ...room, players: [...room.players, bot] };
    this.publishRoom();
    this.maybeBotHostStarts();
  }

  removeDevOpponent(): void {
    const room = this.requireLobby();
    if (!room) return;
    const last = [...room.players]
      .reverse()
      .find((p) => p.id !== LOCAL_PLAYER_ID && p.id !== room.hostId);
    if (!last) return;
    const players = room.players.filter((p) => p.id !== last.id);
    this.opponentCount = Math.max(1, players.length - 1);
    this.room = { ...room, players };
    this.publishRoom();
  }

  // ------------------------------------------------------------ internals

  private subscribe<T>(set: Set<T>, listener: T, replay?: () => void): Unsubscribe {
    set.add(listener);
    replay?.();
    return () => {
      set.delete(listener);
    };
  }

  private reset(): void {
    this.cancelTimer();
    const hadRoom = this.room !== null;
    this.room = null;
    this.game = null;
    if (hadRoom) {
      this.publishView();
      this.publishRoom();
    }
  }

  private cancelTimer(): void {
    this.cancelPending?.();
    this.cancelPending = null;
  }

  private fail(code: ClientError['code'], message: string): void {
    this.listeners.error.forEach((l) => l({ code, message }));
  }

  private requireLobby(): RoomState | null {
    if (!this.room) {
      this.fail('NOT_IN_ROOM', 'You are not in a room');
      return null;
    }
    if (this.room.phase !== 'lobby') {
      this.fail('WRONG_ROOM_PHASE', 'The game has already started');
      return null;
    }
    return this.room;
  }

  private randomCode(): string {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(this.random() * ROOM_CODE_ALPHABET.length)];
    }
    return code;
  }

  private selfPlayer(isHost: boolean): RoomPlayer {
    return {
      id: LOCAL_PLAYER_ID,
      name: this.profile.name,
      avatar: this.profile.avatar,
      ready: false,
      isHost,
      connected: true,
      skipped: false,
    };
  }

  /** Builds `count` ready dev opponents, numbering from `offset`. */
  private makeBots(count: number, offset: number): RoomPlayer[] {
    return Array.from({ length: count }, (_, i) => {
      const n = offset + i;
      return {
        id: `dev-bot-${n + 1}`,
        name: `${BOT_NAMES[n % BOT_NAMES.length]} (dev)`,
        avatar: (AVATARS[(n + 2) % AVATARS.length] as { id: string }).id,
        ready: true,
        isHost: false,
        connected: true,
        skipped: false,
      };
    });
  }

  private patchPlayer(id: string, patch: Partial<RoomPlayer>): void {
    if (!this.room) return;
    this.room = {
      ...this.room,
      players: this.room.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    };
    this.publishRoom();
  }

  /** When a dev opponent hosts, they press Start as soon as everyone is ready. */
  private maybeBotHostStarts(): void {
    const room = this.room;
    if (!room || room.phase !== 'lobby' || room.hostId === LOCAL_PLAYER_ID) return;
    if (room.players.length < 2 || !room.players.every((p) => p.ready)) return;
    this.cancelTimer();
    const go = (): void => {
      if (this.room?.phase === 'lobby') this.startGame(this.room);
    };
    if (this.delay === 0) go();
    else this.cancelPending = this.schedule(go, this.delay);
  }

  private startGame(room: RoomState): void {
    if (room.players.length < 2) {
      this.fail('NOT_ENOUGH_PLAYERS', 'Need at least 2 players');
      return;
    }
    if (!room.players.every((p) => p.ready)) {
      this.fail('NOT_READY', 'Everyone must be ready');
      return;
    }
    this.game = createGame({
      seed: Math.floor(this.random() * 0x7fffffff),
      players: room.players.map((p) => ({ id: p.id, name: p.name })),
    });
    this.room = { ...room, phase: 'inGame' };
    this.publishRoom();
    this.apply(room.players[0]?.id ?? LOCAL_PLAYER_ID, { type: 'startNextRound' });
    this.pumpBots();
  }

  /** Applies an action, publishing events then the new view; reports engine rejections. */
  private apply(playerId: string, action: Action): boolean {
    if (!this.game) return false;
    const result = applyAction(this.game, playerId, action);
    if (!result.ok) {
      if (playerId === LOCAL_PLAYER_ID) this.fail(result.error.code, result.error.message);
      else throw new Error(`Dev bot made an illegal move: ${result.error.message}`);
      return false;
    }
    this.game = result.state;
    const events = redactEvents(result.events, LOCAL_PLAYER_ID);
    this.listeners.events.forEach((l) => l(events));
    this.publishView();
    return true;
  }

  /** Lets dev opponents move until it is the human's turn (or the round/game is over). */
  private pumpBots(): void {
    this.cancelTimer();
    const step = (): void => {
      const game = this.game;
      if (!game || (game.phase !== 'awaitingDraw' && game.phase !== 'awaitingDiscard')) return;
      if (game.players[game.currentIndex]?.id === LOCAL_PLAYER_ID) return;
      const { playerId, action } = devBotAction(game);
      this.apply(playerId, action);
      if (this.delay > 0) this.cancelPending = this.schedule(step, this.delay);
      else step();
    };
    if (this.delay > 0) this.cancelPending = this.schedule(step, this.delay);
    else step();
  }

  private currentView(): GameView | null {
    return this.game ? viewFor(this.game, LOCAL_PLAYER_ID) : null;
  }

  private publishView(): void {
    const view = this.currentView();
    this.listeners.view.forEach((l) => l(view));
  }

  private publishRoom(): void {
    this.listeners.room.forEach((l) => l(this.room));
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
