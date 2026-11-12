# ADR 0005: Server-authoritative game with a shared pure engine

Status: Accepted

## Context

Players hold hidden cards, so clients must not be trusted with other players' hands or the draw pile. The rules also need to be tested thoroughly, replayable, and extensible with house rules later.

## Decision

- The rules live in `packages/engine`, a pure TypeScript package with a reducer `(state, action) → {state, events}`, a seeded PRNG, a meld solver, and a redaction function for per-player views.
- The server (Durable Object) is the only place the full state exists. Clients send intents, the server validates through the engine, and clients receive redacted views plus events.
- The engine is config-driven (deck, rounds, wild rules, scoring, seat limits). Official Five Crowns rules are the default. House rules later are configuration, not forks.
- Clients may import the engine for hints and previews, but never as an authority.

## Consequences

- Cheating by modified clients is very hard, and a client only sees its own hand plus others' card counts.
- Deterministic replay from seed plus action log makes bugs reproducible and enables golden-game tests.
- Redaction becomes a critical, heavily tested module.
- Clients must wait for the server (latency), so the UI animates from events and must handle resync.
- The engine has no I/O, so it is trivially unit-testable and portable.
