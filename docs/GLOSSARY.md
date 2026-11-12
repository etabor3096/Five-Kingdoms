# Glossary

Domain terms used across the [SDD](SDD.md), [rules](rules.md), and code. Use these names consistently in code, UI copy, and docs.

## Game terms

**Round**
One of the 11 deals in a game. Round _n_ deals _n_ + 2 cards to each player and ends after the final turns.

**Hand**
The cards a player holds and has not laid down. Only its owner sees it.

**Draw pile (stock)**
The face-down pile players draw from. Called "stock" in some rule sets; code uses `drawPile`.

**Discard pile**
The face-up pile players discard onto. Only its top card is visible and drawable.

**Meld**
A valid group of cards: a book or a run. Melds are laid down only when going out or on a final turn.

**Book**
A meld of 3+ cards of the same rank, any suits, duplicates allowed.

**Run**
A meld of 3+ consecutive cards of the same suit from 3 through K, with no wrap.

**Wild**
A card that may stand in for any card in a meld: a Joker, or a card of the current round's wild rank.

**Wild rank**
The rank that is wild in the current round. It equals the round's hand size: 3 in round 1, up to K in round 11.

**Natural card**
A card used as its own suit and rank, not as a substitute. A wild-rank card may be used as a natural card in this game.

**Going out**
After drawing, melding the whole hand except one card, laying down the melds, and discarding that card. Triggers final turns.

**Final turn**
The single last turn each other player takes after someone goes out: draw, optionally lay down melds, discard.

**Kingdom**
Our theme name for a suit. Each of the five suits (stars, hearts, diamonds, clubs, spades) is a kingdom with its own color and crest.

## Room terms

**Room**
A private game session identified by a short room code. It is backed by one Durable Object on the server.

**Room code**
A short, unambiguous code that players enter to join a room.

**Seat**
A player's position at the table, in clockwise order. A seat persists across disconnects and is reclaimed with the rejoin token.

**Host**
The player who created the room (or inherited the role). Controls room settings, starting the game, and disconnect decisions.

**Lobby**
The pre-game state of a room where players join, pick ready state, and the host adjusts settings.

## Architecture terms

**View**
The redacted snapshot of game state that one seat is allowed to see: its own hand plus others' card counts.

**Intent**
A request from a client to act (for example draw or discard). The server validates it, and it may be rejected.

**Event**
A record of something that happened in the game, sent redacted to clients, used for animation and logs.

**Action**
The engine's input to its reducer. Intents that pass server checks become actions.

**Reducer**
The engine's pure function from `(state, action)` to the next state plus events.

**Solver**
The engine's meld search, used for validation, hints, auto-arrange, and the test bot.

**Seed**
The number that initialises the PRNG, so a game can be replayed exactly.
