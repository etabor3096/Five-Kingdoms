/**
 * Plain-TS store that listens to a `GameClient` and keeps everything the UI needs in one
 * immutable snapshot. React reads it through `useSyncExternalStore` (see `useClientStore`).
 */

import type { CardId, GameEvent, GameView } from '@five-kingdoms/engine';
import type {
  ClientError,
  ConnectionState,
  EmoteId,
  GameClient,
  RoomState,
} from '../net/GameClient';

export type RoundScoredEvent = Extract<GameEvent, { type: 'roundScored' }>;

export interface Toast {
  id: number;
  text: string;
}

export interface ClientSnapshot {
  room: RoomState | null;
  view: GameView | null;
  /** Latest round result, including the cards each player was left holding. */
  lastScored: RoundScoredEvent | null;
  /** The card you just took from the discard pile; you may not discard it this turn. */
  bannedDiscardId: CardId | null;
  toast: Toast | null;
  /** Emote bubbles currently showing, by player id. */
  emotes: Record<string, { emote: EmoteId; key: number }>;
  /** True once the player has dismissed the last round's scoreboard on the way to standings. */
  standingsOpen: boolean;
  /** `reconnecting` while the socket to the server is down. */
  connection: ConnectionState;
  /**
   * A problem the player must read and dismiss (a toast would vanish too soon), such as a
   * client/server protocol mismatch. Null when there is nothing to show.
   */
  blocking: { title: string; text: string } | null;
}

const TOAST_MS = 3200;
const EMOTE_MS = 2600;

const INITIAL: ClientSnapshot = {
  room: null,
  view: null,
  lastScored: null,
  bannedDiscardId: null,
  toast: null,
  emotes: {},
  standingsOpen: false,
  connection: 'online',
  blocking: null,
};

/** Maps a client error to short toast copy. */
export function errorText(error: ClientError): string {
  return error.message;
}

export class ClientStore {
  private snapshot: ClientSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private readonly unsubs: (() => void)[] = [];
  private nextKey = 1;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(readonly client: GameClient) {
    this.unsubs.push(
      client.onRoom((room) => {
        if (room === null) {
          this.set({
            ...INITIAL,
            toast: this.snapshot.toast,
            blocking: this.snapshot.blocking,
          });
        } else this.set({ room });
      }),
      client.onView((view) => {
        const standingsOpen = view?.phase === 'gameOver' ? this.snapshot.standingsOpen : false;
        this.set({ view, standingsOpen });
      }),
      client.onEvents((events) => this.handleEvents(events)),
      client.onEmote(({ playerId, emote }) => this.showEmote(playerId, emote)),
      client.onError((error) => this.handleError(error)),
      client.onConnection((connection) => this.set({ connection })),
    );
  }

  getSnapshot = (): ClientSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** From the last round's scoreboard, move on to the final standings. */
  openStandings(): void {
    this.set({ standingsOpen: true });
  }

  showToast(text: string): void {
    const toast = { id: this.nextKey++, text };
    this.set({ toast });
    this.later(() => {
      if (this.snapshot.toast?.id === toast.id) this.set({ toast: null });
    }, TOAST_MS);
  }

  /** Closes the blocking message, if any. */
  dismissBlocking(): void {
    this.set({ blocking: null });
  }

  /** Stops listening to the client and cancels timers. */
  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.listeners.clear();
  }

  /** Version mismatches get a message that stays; everything else is a short toast. */
  private handleError(error: ClientError): void {
    if (error.code === 'PROTOCOL_VERSION') {
      this.set({ blocking: { title: 'Update needed', text: error.message } });
    } else {
      this.showToast(errorText(error));
    }
  }

  private handleEvents(events: GameEvent[]): void {
    const selfId = this.snapshot.room?.selfId;
    let banned = this.snapshot.bannedDiscardId;
    let lastScored = this.snapshot.lastScored;
    for (const e of events) {
      if (e.type === 'drew') {
        banned = e.playerId === selfId && e.source === 'discard' && e.card ? e.card.id : null;
      } else if (e.type === 'discarded' || e.type === 'wentOut' || e.type === 'laidDown') {
        if (e.playerId === selfId) banned = null;
      } else if (e.type === 'roundScored') {
        lastScored = e;
        banned = null;
      }
    }
    this.set({ bannedDiscardId: banned, lastScored });
  }

  private showEmote(playerId: string, emote: EmoteId): void {
    const key = this.nextKey++;
    this.set({ emotes: { ...this.snapshot.emotes, [playerId]: { emote, key } } });
    this.later(() => {
      if (this.snapshot.emotes[playerId]?.key !== key) return;
      const { [playerId]: _gone, ...rest } = this.snapshot.emotes;
      void _gone;
      this.set({ emotes: rest });
    }, EMOTE_MS);
  }

  private later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private set(patch: Partial<ClientSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }
}
