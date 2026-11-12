/**
 * Plain-TS store that listens to a `GameClient` and keeps everything the UI needs in one
 * immutable snapshot. React reads it through `useSyncExternalStore` (see `useClientStore`).
 */

import type { CardId, GameEvent, GameView } from '@five-kingdoms/engine';
import type { ClientError, EmoteId, GameClient, RoomState } from '../net/GameClient';

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
        if (room === null) this.set({ ...INITIAL, toast: this.snapshot.toast });
        else this.set({ room });
      }),
      client.onView((view) => {
        const standingsOpen = view?.phase === 'gameOver' ? this.snapshot.standingsOpen : false;
        this.set({ view, standingsOpen });
      }),
      client.onEvents((events) => this.handleEvents(events)),
      client.onEmote(({ playerId, emote }) => this.showEmote(playerId, emote)),
      client.onError((error) => this.showToast(errorText(error))),
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

  /** Stops listening to the client and cancels timers. */
  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.listeners.clear();
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
