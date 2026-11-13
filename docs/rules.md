# Five Kingdoms: Rules Specification

This is the source of truth for game rules. The rules engine (`packages/engine`) implements exactly these statements, and each numbered rule should map to at least one test. Terms are defined in the [glossary](GLOSSARY.md). Product context is in the [SDD](SDD.md).

Rules marked **[Interpretation]** are choices we made where the official rules are silent or ambiguous. They are listed again in the SDD's [Open questions](SDD.md#16-open-questions-for-the-owner); the owner accepted all of them on 2026-11-11. All rule parameters are meant to be config-driven so house rules can be added later (see [ADR 0005](adr/0005-server-authoritative-shared-engine.md)).

## 1. Players

- **1.1** A game has 2 to 7 players (official range).
- **1.2** The maximum seat count is a room setting, default 7. A value of 8 is reserved for a possible future house rule and is not offered in v1.
- **1.3** Seats are ordered clockwise. "Left of X" means the next seat clockwise after X.

## 2. Deck

- **2.1** The deck has 116 cards, made of two identical 58-card decks shuffled together.
- **2.2** Each 58-card deck has five suits (stars, hearts, diamonds, clubs, spades), each with ranks 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K (11 ranks, 55 suited cards), plus 3 Jokers.
- **2.3** Every card has a unique id, so the two copies of the same suit and rank are distinguishable by the engine but identical in play.
- **2.4** Rank order, low to high, is 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K. There is no Ace and no 2.

## 3. Rounds and the wild rank

- **3.1** A game has 11 rounds, numbered 1 to 11.
- **3.2** In round _n_, each player is dealt _n_ + 2 cards (round 1: 3 cards; round 11: 13 cards).
- **3.3** The **wild rank** of round _n_ equals that round's dealt hand size, _n_ + 2, read as a rank: 3 to 10 in rounds 1 to 8, then J (11), Q (12), K (13) in rounds 9 to 11. See the table below.
- **3.4** Jokers are wild in every round.

| Round | Cards dealt | Wild rank |
| ----: | ----------: | :-------- |
|     1 |           3 | 3         |
|     2 |           4 | 4         |
|     3 |           5 | 5         |
|     4 |           6 | 6         |
|     5 |           7 | 7         |
|     6 |           8 | 8         |
|     7 |           9 | 9         |
|     8 |          10 | 10        |
|     9 |          11 | J         |
|    10 |          12 | Q         |
|    11 |          13 | K         |

## 4. Dealing and starting a round

- **4.1** The dealer of round 1 is chosen by the host or at random (a room setting; default random, seeded).
- **4.2** The dealer rotates one seat clockwise each round.
- **4.3** The full 116-card deck is shuffled at the start of every round.
- **4.4** The dealer deals _n_ + 2 cards to each player, one at a time, clockwise starting from the dealer's left.
- **4.5** After dealing, one card is turned face up to start the discard pile. The remaining cards form the draw pile, face down.
- **4.6** The player to the dealer's left takes the first turn. Turn order is clockwise.
- **4.7** If the first face-up card is wild, it is still just the top of the discard pile and can be taken like any other.

## 5. A normal turn

- **5.1** A turn has two steps in order: **draw**, then **discard**.
- **5.2** Draw: the player takes either the top card of the draw pile or the top card of the discard pile, and adds it to their hand.
- **5.3** Discard: the player places one card from their hand face up on the discard pile.
- **5.4** The player's hand size is _n_ + 2 before drawing, _n_ + 3 after drawing, and _n_ + 2 after discarding.
- **5.5** A player may not take any other action during a normal turn. Melds are not laid down on the table during normal turns.
- **5.6** Only the top card of the discard pile is visible to players. Cards beneath it are not browsable. (The server still keeps the full order for reshuffling.)
- **5.7** **[Interpretation]** A player who draws the top discard may not discard that same card in the same turn (it would be a no-op). The draw pile card may be discarded immediately.

## 6. Melds

A **meld** is a valid group of cards. A hand is only melded at the moment of going out (section 7) or during a final turn (section 8).

### 6.1 Books

- **6.1.1** A **book** is 3 or more cards of the same rank.
- **6.1.2** Suits do not matter. Cards of the same rank and same suit (duplicates from the two decks) are allowed in one book.

### 6.2 Runs

- **6.2.1** A **run** is 3 or more cards of the same suit with consecutive ranks.
- **6.2.2** Runs use the rank order 3 through K. There is no wrap-around (Q-K-3 is not a run).
- **6.2.3** A run cannot contain two cards of the same rank.

### 6.3 Wilds in melds

- **6.3.1** A wild card (Joker, or a card of the current round's wild rank) may substitute for any card in a book or run.
- **6.3.2** In a book, a wild takes the book's rank. In a run, a wild takes the rank of the position it fills.
- **6.3.3** A meld has no maximum length. A run can be at most 11 cards (3 through K) and has a single suit.
- **6.3.4** **[Interpretation]** A meld may consist entirely of wild cards (for example three Jokers, or Joker, Joker and a wild-rank card). Such a meld is valid as a book.
- **6.3.5** **[Interpretation]** A natural card of the wild rank may be used as itself. For example, in round 5 (7s wild) a 7 may sit in a book of 7s or in a run as the 7 of its own suit. It can also still be used as a wild substitute for any other card. The engine treats wild-rank cards as flexible, and the solver picks whatever assignment lets the hand go out.
- **6.3.6** A card may belong to only one meld. Melds in a valid arrangement partition the cards laid down.

## 7. Going out

- **7.1** After drawing (step 5.2), a player whose hand of _n_ + 3 cards can be partitioned into valid melds plus exactly one leftover card may **go out**.
- **7.2** To go out, the player lays down all melds face up, then discards the one leftover card.
- **7.3** Going out is always the player's choice. A player who could go out may instead discard and continue.
- **7.4** The player who goes out is the **out-player**. They score 0 for the round.
- **7.5** There is no laying off. No player may add cards to another player's melds, or to their own melds from earlier turns. Melds are laid down only when going out (7.2) or on a final turn (8.3).
- **7.6** The discard in 7.2 counts as the out-player's discard for the turn. It becomes the top of the discard pile.

## 8. Final turns

- **8.1** When a player goes out, every other player takes **exactly one** final turn, in clockwise order starting from the out-player's left. Play then ends.
- **8.2** A final turn is a normal turn (draw from the draw pile or the discard pile, then discard), with the additional option in 8.3.
- **8.3** On their final turn, after drawing, a player may lay down any valid melds from their hand, then discards one card. They are not required to meld everything, and may lay down no melds at all.
- **8.4** **[Interpretation]** Final-turn players arrange their own melds. The engine validates the arrangement they submit. A solver in the engine offers auto-arrange and hints to minimise the leftover score, but never forces a result.
- **8.5** A final-turn player always discards exactly one card at the end of their turn, so their best case mirrors going out: meld every card except one, discard that one, and score 0 for the round.
- **8.6** Cards laid down on a final turn are removed from the player's hand for scoring (9.2). Cards still in hand after the discard are scored.
- **8.7** After the last final turn ends, the round is over and scoring (section 9) takes place.

## 9. Scoring

- **9.1** The out-player scores 0 for the round.
- **9.2** Every other player scores the sum of the point values of the cards left in their hand that are **not** part of melds they laid down on their final turn.
- **9.3** Point values:

| Card                              |     Points |
| --------------------------------- | ---------: |
| 3 through 10                      | Face value |
| Jack                              |         11 |
| Queen                             |         12 |
| King                              |         13 |
| Any card of the round's wild rank |         20 |
| Joker                             |         50 |

- **9.4** The wild-rank value (20) overrides the face value for cards of that rank. For example, in round 9 a Jack scores 20, not 11.
- **9.5** Round scores are added to each player's running total.
- **9.6** The game ends after round 11. The player with the **lowest** total wins. Tied players share the win.

## 10. Draw pile exhaustion

- **10.1** **[Interpretation]** If a player must draw and the draw pile is empty, the discard pile except its top card is shuffled to form a new draw pile. The top discard stays in place as the new discard pile. Play continues.
- **10.2** The reshuffle uses the room's seeded PRNG so the server can replay it deterministically.
- **10.3** If after a reshuffle there are still no cards to draw from the draw pile (only possible in extreme cases), the player must take the top discard.

## 11. Edge cases and invariants (for tests)

- **11.1** At the start of any turn, total cards across all hands, the draw pile and the discard pile equals 116.
- **11.2** A card exists in exactly one place at any time (a hand, the draw pile, the discard pile, or a laid-down meld).
- **11.3** A player's score for a round is never negative and is at most the sum of values in their hand.
- **11.4** The out-player's melds plus their discard account for all _n_ + 3 cards of their post-draw hand.
- **11.5** A round always ends: once someone goes out, at most _p_ − 1 final turns follow, where _p_ is the number of players.
- **11.6** If nobody can or wants to go out, play continues indefinitely, with draw pile reshuffles (10.1). The optional turn timer (SDD section 5) is the practical protection against stalling. There is no automatic round limit in v1.
- **11.7** Disconnects, skipped turns and bot substitution are room-level behaviours, not rules. They are specified in the [SDD](SDD.md#9-networking-protocol), not here. A skipped turn is treated as an automatic draw-from-draw-pile and discard of the drawn card (SDD open question 8, accepted).

## 12. Summary of interpretations

| #   | Interpretation                                                                                      | Rule  |
| --- | --------------------------------------------------------------------------------------------------- | ----- |
| 1   | A meld may be made entirely of wild cards                                                           | 6.3.4 |
| 2   | When the draw pile empties, the discard pile except its top card is reshuffled into a new draw pile | 10.1  |
| 3   | A natural card of the wild rank may be used as itself                                               | 6.3.5 |
| 4   | Final-turn players arrange their own melds; the solver only offers auto-arrange and hints           | 8.4   |

Two further gaps we found while writing this (5.7 and 11.7) are SDD open questions 5 and 8. The owner accepted all of these on 2026-11-11.
