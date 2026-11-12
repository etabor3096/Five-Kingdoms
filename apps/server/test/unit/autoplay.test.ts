import { applyAction, createGame, type GameState } from '@five-kingdoms/engine';
import { describe, expect, it } from 'vitest';
import { pickAutoMove } from '../../src/autoplay';

function started(): GameState {
  const game = createGame({
    seed: 7,
    players: [
      { id: 'p0', name: 'A' },
      { id: 'p1', name: 'B' },
      { id: 'p2', name: 'C' },
    ],
  });
  const r = applyAction(game, 'p0', { type: 'startNextRound' });
  if (!r.ok) throw new Error('start failed');
  return r.state;
}

describe('pickAutoMove', () => {
  it('draws from stock first, falling back to the discard pile', () => {
    const state = started();
    const move = pickAutoMove(state);
    expect(move?.playerId).toBe(state.players[state.currentIndex]?.id);
    expect(move?.candidates).toEqual([{ type: 'drawFromStock' }, { type: 'drawFromDiscard' }]);
  });

  it('discards the card it just drew', () => {
    const state = started();
    const move = pickAutoMove(state);
    const drawn = applyAction(state, move!.playerId, { type: 'drawFromStock' });
    if (!drawn.ok) throw new Error('draw failed');
    const next = pickAutoMove(drawn.state);
    const hand = drawn.state.players[drawn.state.currentIndex]!.hand;
    expect(next?.candidates).toEqual([{ type: 'discard', cardId: hand.at(-1)!.id }]);
    expect(applyAction(drawn.state, next!.playerId, next!.candidates[0]!).ok).toBe(true);
  });

  it('discards a different card when the drawn discard may not be thrown back', () => {
    const state = started();
    const id = state.players[state.currentIndex]!.id;
    const drawn = applyAction(state, id, { type: 'drawFromDiscard' });
    if (!drawn.ok) throw new Error('draw failed');
    const move = pickAutoMove(drawn.state)!;
    const action = move.candidates[0]!;
    expect(action.type).toBe('discard');
    expect('cardId' in action && action.cardId).not.toBe(drawn.state.drawnFromDiscardId);
    expect(applyAction(drawn.state, move.playerId, action).ok).toBe(true);
  });

  it('lays down with no melds during final turns', () => {
    const state = started();
    const id = state.players[state.currentIndex]!.id;
    const drawn = applyAction(state, id, { type: 'drawFromStock' });
    if (!drawn.ok) throw new Error('draw failed');
    const finalTurn: GameState = { ...drawn.state, outPlayerId: 'someone', finalTurnQueue: [id] };
    const move = pickAutoMove(finalTurn)!;
    expect(move.candidates[0]).toMatchObject({ type: 'finalTurnLayDown', melds: [] });
    expect(applyAction(finalTurn, id, move.candidates[0]!).ok).toBe(true);
  });

  it('returns null when no turn is pending', () => {
    expect(pickAutoMove({ ...started(), phase: 'roundOver' })).toBeNull();
    expect(pickAutoMove({ ...started(), phase: 'gameOver' })).toBeNull();
  });
});
