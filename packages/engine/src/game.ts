/** Game creation and the single entry point for changing state: `applyAction`. */

import { buildDeck, type Card, type CardId, type Rank } from './cards';
import type { GameEvent, RoundScoreEntry } from './events';
import { validateMeld } from './meld';
import { nextRandom, seedToState, shuffle } from './rng';
import {
  DEFAULT_RULES,
  TOTAL_ROUNDS,
  handSizeForRound,
  sumPoints,
  wildRankForRound,
  type RulesConfig,
} from './rules';
import type { Action, ActionError, ActionResult, ErrorCode, GameState, PlayerState } from './state';

export interface CreateGameOptions {
  seed: number;
  players: { id: string; name: string }[];
  rules?: Partial<RulesConfig>;
  /** Seat that deals round 1. Omit to choose it with the seeded PRNG. */
  firstDealerSeat?: number;
}

/** Creates a game waiting for `startNextRound` (which deals round 1 and emits its events). */
export function createGame(options: CreateGameOptions): GameState {
  const rules: RulesConfig = { ...DEFAULT_RULES, ...options.rules };
  const { players } = options;
  if (rules.maxSeats > 8)
    throw new RangeError('maxSeats cannot exceed 8 (8 x 13 + 1 cards must fit in 116)');
  if (players.length < rules.minSeats || players.length > rules.maxSeats) {
    throw new RangeError(`Need ${rules.minSeats}-${rules.maxSeats} players, got ${players.length}`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new RangeError('Player ids must be unique');
  }

  let rngState = seedToState(options.seed);
  let dealerIndex: number;
  if (options.firstDealerSeat !== undefined) {
    dealerIndex = options.firstDealerSeat;
    if (!Number.isInteger(dealerIndex) || dealerIndex < 0 || dealerIndex >= players.length) {
      throw new RangeError('firstDealerSeat is not a valid seat');
    }
  } else {
    const r = nextRandom(rngState);
    rngState = r.state;
    dealerIndex = Math.floor(r.value * players.length);
  }

  return {
    rules,
    seed: options.seed,
    rngState,
    round: 0,
    dealerIndex,
    currentIndex: dealerIndex,
    phase: 'awaitingStart',
    wildRank: null,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      hand: [],
      melds: [],
      score: 0,
      roundScores: [],
    })),
    drawPile: [],
    discardPile: [],
    outPlayerId: null,
    finalTurnQueue: [],
    drawnFromDiscardId: null,
    winnerIds: [],
  };
}

/**
 * Applies one player's action. Never throws for illegal moves: returns a typed error and
 * leaves the input state untouched. On success returns a new state and the events
 * (unredacted; use `redactEvents` per recipient).
 *
 * Rounds do not auto-advance: after scoring, any player sends `startNextRound`, so the
 * UI can show the scores first.
 */
export function applyAction(state: GameState, playerId: string, action: Action): ActionResult {
  const seat = state.players.findIndex((p) => p.id === playerId);
  if (seat < 0) return fail('UNKNOWN_PLAYER', `No such player: ${String(playerId)}`);

  switch (action.type) {
    case 'startNextRound':
      return startNextRound(state);
    case 'drawFromStock':
    case 'drawFromDiscard':
      return drawCard(state, seat, action.type === 'drawFromStock' ? 'stock' : 'discard');
    case 'discard':
      return discardCard(state, seat, action.cardId);
    case 'goOut':
    case 'finalTurnLayDown':
      return layDown(state, seat, action);
    default:
      return fail('INVALID_ACTION', 'Unknown action');
  }
}

// ---------------------------------------------------------------- helpers

function fail(code: ErrorCode, message: string): { ok: false; error: ActionError } {
  return { ok: false, error: { code, message } };
}

function ok(state: GameState, events: GameEvent[]): ActionResult {
  return { ok: true, state, events };
}

function withPlayer(state: GameState, seat: number, patch: Partial<PlayerState>): PlayerState[] {
  return state.players.map((p, i) => (i === seat ? { ...p, ...patch } : p));
}

/** Checks it is `seat`'s turn in `phase`. */
function turnError(state: GameState, seat: number, phase: 'awaitingDraw' | 'awaitingDiscard') {
  if (state.phase !== phase)
    return fail('WRONG_PHASE', `Expected phase ${phase}, game is in ${state.phase}`);
  if (state.currentIndex !== seat) return fail('NOT_YOUR_TURN', 'It is not your turn');
  return null;
}

// ---------------------------------------------------------------- rounds

function startNextRound(state: GameState): ActionResult {
  if (state.phase !== 'awaitingStart' && state.phase !== 'roundOver') {
    return fail('WRONG_PHASE', `Cannot start a round in phase ${state.phase}`);
  }
  const n = state.players.length;
  const round = state.round + 1;
  // Round 1 uses the dealer chosen at creation; afterwards the deal moves clockwise.
  const dealerIndex = round === 1 ? state.dealerIndex : (state.dealerIndex + 1) % n;
  const handSize = handSizeForRound(round);
  const wildRank = wildRankForRound(round);

  const shuffled = shuffle(buildDeck(), state.rngState);
  const deck = shuffled.items;
  const hands: Card[][] = state.players.map(() => []);
  let next = 0;
  for (let i = 0; i < handSize; i++) {
    for (let k = 1; k <= n; k++) hands[(dealerIndex + k) % n]?.push(deck[next++] as Card);
  }
  const startingDiscard = deck[next++] as Card;
  const currentIndex = (dealerIndex + 1) % n;

  const players = state.players.map((p, i) => ({ ...p, hand: hands[i] as Card[], melds: [] }));
  const events: GameEvent[] = [
    {
      type: 'roundStarted',
      round,
      dealerId: (players[dealerIndex] as PlayerState).id,
      firstPlayerId: (players[currentIndex] as PlayerState).id,
      wildRank,
      handSize,
    },
    ...players.map((p): GameEvent => ({
      type: 'dealt',
      playerId: p.id,
      count: p.hand.length,
      cards: p.hand,
    })),
    { type: 'startingDiscard', card: startingDiscard },
  ];
  return ok(
    {
      ...state,
      rngState: shuffled.state,
      round,
      dealerIndex,
      currentIndex,
      phase: 'awaitingDraw',
      wildRank,
      players,
      drawPile: deck.slice(next),
      discardPile: [startingDiscard],
      outPlayerId: null,
      finalTurnQueue: [],
      drawnFromDiscardId: null,
    },
    events,
  );
}

/** Scores the round, then either waits for the next one or ends the game. */
function scoreRound(state: GameState, events: GameEvent[]): ActionResult {
  const wildRank = state.wildRank as Rank;
  const scores: RoundScoreEntry[] = state.players.map((p) => ({
    playerId: p.id,
    points: p.id === state.outPlayerId ? 0 : sumPoints(p.hand, wildRank),
    leftover: p.id === state.outPlayerId ? [] : p.hand,
  }));
  const players = state.players.map((p, i) => {
    const points = (scores[i] as RoundScoreEntry).points;
    return { ...p, score: p.score + points, roundScores: [...p.roundScores, points] };
  });
  const out: GameEvent[] = [...events, { type: 'roundScored', round: state.round, scores }];

  if (state.round < TOTAL_ROUNDS) {
    return ok(
      { ...state, players, phase: 'roundOver', finalTurnQueue: [], drawnFromDiscardId: null },
      out,
    );
  }
  const lowest = Math.min(...players.map((p) => p.score));
  const winnerIds = players.filter((p) => p.score === lowest).map((p) => p.id);
  out.push({
    type: 'gameOver',
    winnerIds,
    totals: players.map((p) => ({ playerId: p.id, score: p.score })),
  });
  return ok(
    {
      ...state,
      players,
      phase: 'gameOver',
      winnerIds,
      finalTurnQueue: [],
      drawnFromDiscardId: null,
    },
    out,
  );
}

// ---------------------------------------------------------------- turns

function drawCard(state: GameState, seat: number, source: 'stock' | 'discard'): ActionResult {
  const err = turnError(state, seat, 'awaitingDraw');
  if (err) return err;

  let { drawPile, discardPile, rngState } = state;
  const events: GameEvent[] = [];

  if (source === 'stock' && drawPile.length === 0) {
    if (!state.rules.reshuffleDiscardWhenStockEmpty || discardPile.length < 2) {
      return fail('STOCK_EMPTY', 'The draw pile is empty and cannot be refilled');
    }
    const top = discardPile[discardPile.length - 1] as Card;
    const shuffled = shuffle(discardPile.slice(0, -1), rngState);
    drawPile = shuffled.items;
    discardPile = [top];
    rngState = shuffled.state;
    events.push({ type: 'reshuffled', count: drawPile.length });
  }

  let card: Card;
  if (source === 'stock') {
    card = drawPile[drawPile.length - 1] as Card;
    drawPile = drawPile.slice(0, -1);
  } else {
    if (discardPile.length === 0) return fail('STOCK_EMPTY', 'The discard pile is empty');
    card = discardPile[discardPile.length - 1] as Card;
    discardPile = discardPile.slice(0, -1);
  }

  const player = state.players[seat] as PlayerState;
  events.push({ type: 'drew', playerId: player.id, source, card });
  return ok(
    {
      ...state,
      rngState,
      drawPile,
      discardPile,
      players: withPlayer(state, seat, { hand: [...player.hand, card] }),
      phase: 'awaitingDiscard',
      drawnFromDiscardId: source === 'discard' ? card.id : null,
    },
    events,
  );
}

/** Rejects discarding the card just taken from the discard pile, when that rule is on. */
function drawnDiscardError(state: GameState, discardId: CardId) {
  if (state.rules.forbidDiscardingDrawnDiscard && state.drawnFromDiscardId === discardId) {
    return fail(
      'CANNOT_DISCARD_DRAWN_DISCARD',
      'You cannot discard the card you just took from the discard pile',
    );
  }
  return null;
}

function discardCard(state: GameState, seat: number, cardId: CardId): ActionResult {
  const err = turnError(state, seat, 'awaitingDiscard');
  if (err) return err;
  if (state.outPlayerId !== null) {
    return fail('WRONG_PHASE', 'Final turns must end with finalTurnLayDown');
  }
  const player = state.players[seat] as PlayerState;
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) return fail('CARD_NOT_IN_HAND', 'That card is not in your hand');
  const drawnErr = drawnDiscardError(state, cardId);
  if (drawnErr) return drawnErr;

  return ok(
    {
      ...state,
      players: withPlayer(state, seat, { hand: player.hand.filter((c) => c.id !== cardId) }),
      discardPile: [...state.discardPile, card],
      currentIndex: (seat + 1) % state.players.length,
      phase: 'awaitingDraw',
      drawnFromDiscardId: null,
    },
    [{ type: 'discarded', playerId: player.id, card }],
  );
}

/** Shared by `goOut` (hand minus one card must be fully melded) and the final-turn lay-down. */
function layDown(
  state: GameState,
  seat: number,
  action: Extract<Action, { type: 'goOut' | 'finalTurnLayDown' }>,
): ActionResult {
  const err = turnError(state, seat, 'awaitingDiscard');
  if (err) return err;
  const isFinal = state.outPlayerId !== null;
  if (action.type === 'goOut' && isFinal) return fail('WRONG_PHASE', 'Someone already went out');
  if (action.type === 'finalTurnLayDown' && !isFinal) {
    return fail('WRONG_PHASE', 'Final turns have not started');
  }
  if (!Array.isArray(action.melds) || !action.melds.every(Array.isArray)) {
    return fail('INVALID_ACTION', 'melds must be a list of card id lists');
  }

  const player = state.players[seat] as PlayerState;
  const wildRank = state.wildRank as Rank;
  const used = new Set<CardId>();
  const melds: Card[][] = [];
  for (const ids of action.melds) {
    const cards: Card[] = [];
    for (const id of ids) {
      const card = player.hand.find((c) => c.id === id);
      if (!card) return fail('CARD_NOT_IN_HAND', `Card ${String(id)} is not in your hand`);
      if (used.has(id)) return fail('DUPLICATE_CARD', `Card ${id} is used more than once`);
      used.add(id);
      cards.push(card);
    }
    const check = validateMeld(cards, wildRank);
    if (!check.ok) return fail('INVALID_MELD', check.reason);
    melds.push(cards);
  }

  const discard = player.hand.find((c) => c.id === action.discardCardId);
  if (!discard) return fail('CARD_NOT_IN_HAND', 'The discard card is not in your hand');
  if (used.has(discard.id)) return fail('DUPLICATE_CARD', 'The discard card is also in a meld');
  const drawnErr = drawnDiscardError(state, discard.id);
  if (drawnErr) return drawnErr;

  const hand = player.hand.filter((c) => !used.has(c.id) && c.id !== discard.id);
  if (!isFinal && hand.length > 0) {
    return fail('HAND_NOT_COVERED', 'To go out, every card except the discard must be in a meld');
  }

  const players = withPlayer(state, seat, { hand, melds });
  const discardPile = [...state.discardPile, discard];
  const n = state.players.length;

  if (!isFinal) {
    const queue = Array.from(
      { length: n - 1 },
      (_, k) => (state.players[(seat + 1 + k) % n] as PlayerState).id,
    );
    return ok(
      {
        ...state,
        players,
        discardPile,
        outPlayerId: player.id,
        finalTurnQueue: queue,
        currentIndex: (seat + 1) % n,
        phase: 'awaitingDraw',
        drawnFromDiscardId: null,
      },
      [{ type: 'wentOut', playerId: player.id, melds, discard }],
    );
  }

  const event: GameEvent = { type: 'laidDown', playerId: player.id, melds, discard };
  const queue = state.finalTurnQueue.slice(1);
  const after = { ...state, players, discardPile, finalTurnQueue: queue, drawnFromDiscardId: null };
  if (queue.length === 0) return scoreRound(after, [event]);
  return ok(
    {
      ...after,
      currentIndex: state.players.findIndex((p) => p.id === queue[0]),
      phase: 'awaitingDraw',
    },
    [event],
  );
}
