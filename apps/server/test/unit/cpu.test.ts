import {
  applyAction,
  createGame,
  redactEvents,
  viewFor,
  type GameState,
} from '@five-kingdoms/engine';
import { describe, expect, it } from 'vitest';
import { pickAutoMove } from '../../src/autoplay';

const players = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));

/** A 7-player game dealt into the given round (jumping straight there for the largest hands). */
function dealtInRound(round: number): GameState {
  const game = createGame({ seed: 3, players });
  const start = applyAction({ ...game, round: round - 1, phase: 'roundOver' }, 'p0', {
    type: 'startNextRound',
  });
  if (!start.ok) throw new Error('start failed');
  return start.state;
}

/** Times `steps` turns: engine step, seven redacted payloads as JSON, and the state as JSON. */
function measure(initial: GameState, steps: number): number[] {
  let state = initial;
  const samples: number[] = [];
  for (let i = 0; i < steps && state.phase !== 'roundOver'; i++) {
    const move = pickAutoMove(state)!;
    const t0 = performance.now();
    const result = move.candidates
      .map((a) => applyAction(state, move.playerId, a))
      .find((r) => r.ok)!;
    if (!result.ok) throw new Error('unreachable');
    for (const p of players) {
      JSON.stringify({
        type: 'events',
        events: redactEvents(result.events, p.id),
        view: viewFor(result.state, p.id),
        version: i,
      });
    }
    JSON.stringify(result.state);
    samples.push(performance.now() - t0);
    state = result.state;
  }
  return samples.sort((a, b) => a - b);
}

/**
 * Rough CPU cost of one accepted intent for a full 7-player table. workerd freezes its clock
 * during synchronous work, so this is measured in Node (V8) rather than inside the Worker.
 */
describe('cost of one intent', () => {
  it.each([1, 11])('stays far below the 10 ms Workers Free CPU cap in round %i', (round) => {
    const samples = measure(dealtInRound(round), 300);
    const median = samples[Math.floor(samples.length / 2)]!;
    const p95 = samples[Math.floor(samples.length * 0.95)]!;
    console.log(
      `intent cpu (7 players, round ${round}): n=${samples.length} median=${median.toFixed(3)}ms p95=${p95.toFixed(3)}ms`,
    );
    expect(p95).toBeLessThan(5);
  });
});
