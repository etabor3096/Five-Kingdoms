import { describe, expect, it } from 'vitest';
import { TestClient, lobbyOf, sleep, startGame } from '../helpers/client';
import { chooseIntent } from '../helpers/player';

describe('disconnects', () => {
  it('pauses on disconnect and resumes when the player returns', async () => {
    const { code, clients } = await lobbyOf(2);
    const [a, b] = clients as [TestClient, TestClient];
    await startGame(clients);
    const token = b.token!;
    b.close();
    const paused = await a.next('roomUpdate', (m) => m.room.pause !== null);
    expect(paused.room.pause?.seats).toEqual([1]);
    expect(paused.room.pause?.expired).toBe(false);

    a.send({ type: 'intent', action: { type: 'drawFromStock' }, lastVersion: 1 });
    expect((await a.next('error')).code).toBe('PAUSED');

    const b2 = await TestClient.join(code, 'B', token);
    const resumed = await a.next('roomUpdate', (m) => m.room.pause === null);
    expect(resumed.room.players[1]!.connected).toBe(true);
    expect(b2.seat).toBe(1);
  });

  it('lets the host wait or skip after the deadline, then auto-plays the skipped seat', async () => {
    const { code, clients } = await lobbyOf(2);
    const [a, b] = clients as [TestClient, TestClient];
    await startGame(clients);
    const token = b.token!;
    b.close();
    await a.next('roomUpdate', (m) => m.room.pause !== null);

    // Too early for a decision.
    a.send({ type: 'hostDecision', seat: 1, decision: 'skip' });
    expect((await a.next('error')).code).toBe('BAD_STATE');

    // GRACE_MS is 400 ms in tests.
    const expired = await a.next('roomUpdate', (m) => m.room.pause?.expired === true);
    a.send({ type: 'hostDecision', seat: 1, decision: 'wait' });
    const waiting = await a.next('roomUpdate', (m) => m.room.pause?.expired === false);
    expect(waiting.room.pause!.deadline).toBeGreaterThan(expired.room.pause!.deadline);
    await a.next('roomUpdate', (m) => m.room.pause?.expired === true);

    a.send({ type: 'hostDecision', seat: 1, decision: 'skip' });
    const after = await a.next('roomUpdate', (m) => m.room.pause === null);
    expect(after.room.players[1]!.skipped).toBe(true);

    // A plays; B's turns are played automatically (draw from stock, discard). If A goes out,
    // B's final turn is a lay-down with no melds instead of a plain discard.
    const bDiscarded = () =>
      a.raw.some((r) => /"type":"(discarded|laidDown)","playerId":"p1"/.test(r));
    for (let i = 0; i < 10 && !bDiscarded(); i++) {
      await sleep(100);
      const intent = a.view && chooseIntent(a.view);
      if (intent) a.send({ type: 'intent', action: intent, lastVersion: a.version });
    }
    expect(bDiscarded()).toBe(true);
    expect(a.raw.some((r) => /"type":"drew","playerId":"p1","source":"stock"/.test(r))).toBe(true);

    // The skipped player returns and is no longer skipped.
    const b2 = await TestClient.join(code, 'B', token);
    const room = await a.next('roomUpdate', (m) => m.room.players[1]!.connected);
    expect(room.room.players[1]!.skipped).toBe(false);
    expect(b2.view?.viewerId).toBe('p1');
  });

  it('only the host may decide', async () => {
    const { clients } = await lobbyOf(3);
    const [a, b, c] = clients as [TestClient, TestClient, TestClient];
    await startGame(clients);
    c.close();
    await a.next('roomUpdate', (m) => m.room.pause?.expired === true);
    b.send({ type: 'hostDecision', seat: 2, decision: 'skip' });
    expect((await b.next('error')).code).toBe('NOT_HOST');
  });
});
