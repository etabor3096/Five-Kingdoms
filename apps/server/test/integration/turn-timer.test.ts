import { describe, expect, it } from 'vitest';
import { TestClient, lobbyOf, sleep, startGame } from '../helpers/client';

/** TURN_MS is 500 ms and GRACE_MS 400 ms in tests (`vitest.config.ts`). */

/** Starts a two-player game with the turn timer on. Returns the clients and who moves first. */
async function timedGame() {
  const { code, clients } = await lobbyOf(2);
  const [a, b] = clients as [TestClient, TestClient];
  a.send({ type: 'settings', turnTimer: true });
  await a.next('roomUpdate', (m) => m.room.turnTimer);
  await startGame(clients);
  const first = a.view!.currentPlayerId;
  return { code, a, b, first, second: first === 'p0' ? 'p1' : 'p0' };
}

const sawEvent = (c: TestClient, type: string, playerId: string, extra = '') =>
  c.raw.some((r) => r.includes(`"type":"${type}","playerId":"${playerId}"${extra}`));

describe('turn timer', () => {
  it('is off by default and only the host can switch it on, in the lobby', async () => {
    const { clients } = await lobbyOf(2);
    const [a, b] = clients as [TestClient, TestClient];
    b.send({ type: 'settings', turnTimer: true });
    expect((await b.next('error')).code).toBe('NOT_HOST');

    await startGame(clients);
    const room = (await a.next('roomUpdate', (m) => m.room.status === 'game')).room;
    expect(room.turnTimer).toBe(false);
    expect(room.turnDeadline).toBeNull();

    a.send({ type: 'settings', turnTimer: true });
    expect((await a.next('error')).code).toBe('BAD_STATE');
    // Nothing is auto-played without the timer.
    await sleep(800);
    expect(a.raw.some((r) => r.includes('"type":"drew"'))).toBe(false);
  });

  it('plays a turn that runs out of time: draw from the draw pile, discard the drawn card', async () => {
    const { a, first, second } = await timedGame();
    const started = await a.next('roomUpdate', (m) => m.room.turnDeadline !== null);

    // Nobody acts. The first player's turn is played for them, then the clock restarts.
    const next = await a.next(
      'roomUpdate',
      (m) => m.room.turnDeadline !== null && m.room.turnDeadline > started.room.turnDeadline!,
    );
    expect(sawEvent(a, 'drew', first, ',"source":"stock"')).toBe(true);
    expect(sawEvent(a, 'discarded', first)).toBe(true);
    expect(a.view!.currentPlayerId).toBe(second);
    // A timed-out player is not skipped: their next turn is theirs.
    expect(next.room.players.every((p) => !p.skipped)).toBe(true);
    expect(a.view!.players.every((p) => p.handCount === 3)).toBe(true);
  });

  it('only discards when the player had already drawn', async () => {
    const { a, b, first } = await timedGame();
    const mover = first === 'p0' ? a : b;
    mover.send({ type: 'intent', action: { type: 'drawFromStock' }, lastVersion: mover.version });
    await a.next('events', (m) => m.view.phase === 'awaitingDiscard');

    await a.next('events', (m) => m.view.currentPlayerId !== first);
    const draws = a.raw.join('').split(`"type":"drew","playerId":"${first}"`).length - 1;
    expect(draws).toBe(1);
    expect(sawEvent(a, 'discarded', first)).toBe(true);
  });

  it('stops the clock while the game is paused and resumes it afterwards', async () => {
    const { code, a, b, first } = await timedGame();
    await a.next('roomUpdate', (m) => m.room.turnDeadline !== null);
    const token = b.token!;
    b.close();
    const paused = await a.next('roomUpdate', (m) => m.room.pause !== null);
    expect(paused.room.turnDeadline).toBeNull();

    // Well past the turn length: the paused turn has not been played.
    await sleep(900);
    expect(sawEvent(a, 'drew', first)).toBe(false);

    await TestClient.join(code, 'P1', token);
    const resumed = await a.next('roomUpdate', (m) => m.room.pause === null);
    expect(resumed.room.turnDeadline).not.toBeNull();
    await a.next('events', (m) => m.view.currentPlayerId !== first);
    expect(sawEvent(a, 'discarded', first)).toBe(true);
  });
});
