/** Test client: a real WebSocket to the Worker, with an inbox that tests can wait on. */

import { exports } from 'cloudflare:workers';
import type { GameView } from '@five-kingdoms/engine';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '@five-kingdoms/protocol';
import { chooseIntent } from './player';

/** The Worker's default export: `fetch` runs the same code as a deployed request. */
export const worker = (exports as unknown as { default: { fetch(r: Request): Promise<Response> } })
  .default;

/** Creates a room through the public route and returns its code. */
export async function createRoom(): Promise<string> {
  const res = await worker.fetch(new Request('http://test/rooms', { method: 'POST' }));
  return (await res.json<{ code: string }>()).code;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class TestClient {
  /** Everything received, as raw JSON text (for leak checks) and parsed. */
  readonly raw: string[] = [];
  readonly inbox: ServerMessage[] = [];
  private cursor = 0;
  private waiters: (() => void)[] = [];
  closed = false;
  seat = -1;
  token: string | null = null;
  /** Newest view and version seen, like a real client would hold. */
  view: GameView | null = null;
  version = 0;

  private constructor(
    private readonly ws: WebSocket,
    readonly code: string,
  ) {
    ws.addEventListener('message', (e) => {
      const text = String(e.data);
      if (text === 'pong') return;
      this.raw.push(text);
      const message = JSON.parse(text) as ServerMessage;
      if (message.type === 'events' || message.type === 'view') {
        this.view = message.view;
        this.version = message.version;
      } else if (message.type === 'welcome') {
        this.view = message.view;
        this.version = message.version;
      }
      this.inbox.push(message);
      this.wake();
    });
    ws.addEventListener('close', () => {
      this.closed = true;
      this.wake();
    });
  }

  /** Opens a socket to the room's `/ws` route. */
  static async open(code: string): Promise<TestClient> {
    const res = await worker.fetch(
      new Request(`http://test/rooms/${code}/ws`, { headers: { Upgrade: 'websocket' } }),
    );
    if (!res.webSocket) throw new Error(`no websocket, status ${res.status}`);
    res.webSocket.accept();
    return new TestClient(res.webSocket, code);
  }

  /** Opens a socket and joins, resolving once `welcome` arrives. */
  static async join(code: string, name: string, rejoinToken?: string): Promise<TestClient> {
    const client = await TestClient.open(code);
    client.send({
      type: 'join',
      roomCode: code,
      name,
      avatar: 'fox',
      protocolVersion: PROTOCOL_VERSION,
      ...(rejoinToken ? { rejoinToken } : {}),
    });
    const welcome = await client.next('welcome');
    client.seat = welcome.seat;
    client.token = welcome.rejoinToken ?? rejoinToken ?? null;
    return client;
  }

  send(message: ClientMessage): void {
    this.ws.send(JSON.stringify(message));
  }

  sendRaw(text: string): void {
    this.ws.send(text);
  }

  close(): void {
    this.ws.close(1000, 'bye');
  }

  /** Resolves with the next unread message of this type (skipping other types). */
  async next<T extends ServerMessage['type']>(
    type: T,
    where: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
    timeoutMs = 8000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.cursor < this.inbox.length) {
        const m = this.inbox[this.cursor++] as ServerMessage;
        if (m.type === type && where(m as Extract<ServerMessage, { type: T }>)) {
          return m as Extract<ServerMessage, { type: T }>;
        }
      }
      if (this.closed) throw new Error(`socket closed while waiting for ${type}`);
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out waiting for ${type}`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  /** Marks everything received so far as read. */
  drain(): void {
    this.cursor = this.inbox.length;
  }

  /** Unread messages of a type, without waiting. */
  pending(type: ServerMessage['type']): ServerMessage[] {
    return this.inbox.slice(this.cursor).filter((m) => m.type === type);
  }

  private wake(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }
}

/** Joins `n` players to a fresh room, the first being host. */
export async function lobbyOf(n: number): Promise<{ code: string; clients: TestClient[] }> {
  const code = await createRoom();
  const clients: TestClient[] = [];
  for (let i = 0; i < n; i++) clients.push(await TestClient.join(code, `P${i}`));
  return { code, clients };
}

/** Everyone readies up and the host starts; resolves when all have the first `events`. */
export async function startGame(clients: TestClient[]): Promise<void> {
  for (const c of clients) c.send({ type: 'ready' });
  await clients[0]!.next('roomUpdate', (m) => m.room.players.every((p) => p.ready));
  clients[0]!.send({ type: 'start' });
  await Promise.all(clients.map((c) => c.next('events')));
}

/**
 * Plays one scripted turn for whoever is up, then waits until every client has seen it.
 * Returns the events message the mover received.
 */
export async function playTurn(clients: TestClient[]) {
  const mover = clients.find((c) => c.view && chooseIntent(c.view));
  if (!mover?.view) throw new Error('nobody to move');
  const before = mover.version;
  mover.send({ type: 'intent', action: chooseIntent(mover.view)!, lastVersion: before });
  const all = await Promise.all(clients.map((c) => c.next('events', (m) => m.version > before)));
  return all[clients.indexOf(mover)]!;
}
