# ADR 0004: Cloudflare Workers and Durable Objects for rooms

Status: Accepted

## Context

Rooms need real-time, ordered, stateful coordination over WebSockets for 2 to 7 players, with a free or near-free budget. A room is small and short-lived.

## Decision

Host the server on Cloudflare Workers, with one Durable Object per room. The Worker routes connections by room code. The DO holds authoritative game state, accepts WebSockets, persists state to DO storage, and uses alarms for the reconnect grace period, turn timer, and the 30-minute room expiry.

Free-tier limits are not yet verified. A research task will confirm current limits before milestone 2.

## Consequences

- A DO serializes all actions for a room, so no locking or external pub/sub is needed.
- Scales to many rooms at little or no cost, and rooms cost almost nothing when idle if WebSocket hibernation is used.
- Ties the server to Cloudflare APIs. The engine stays portable, and the thin server layer could be moved if needed.
- Local development and testing need Workers tooling (wrangler/Miniflare).
- If the free tier proves too restrictive, the budget assumption needs revisiting.
