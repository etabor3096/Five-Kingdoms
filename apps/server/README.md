# @five-kingdoms/server

The authoritative game server: a Cloudflare Worker plus one SQLite-backed Durable Object
class, `Room`, per room. Clients talk to it over WebSockets using the messages in
[`@five-kingdoms/protocol`](../../packages/protocol/src/messages.ts). The rules live in
[`@five-kingdoms/engine`](../../packages/engine).

## Commands

Run from the repo root (or drop `--filter` inside `apps/server`):

| Command                                           | What it does                                          |
| ------------------------------------------------- | ----------------------------------------------------- |
| `pnpm --filter @five-kingdoms/server dev`         | `wrangler dev` on http://localhost:8787 (local only)  |
| `pnpm --filter @five-kingdoms/server test`        | Unit tests (Node) and integration tests (workerd)     |
| `pnpm --filter @five-kingdoms/server typecheck`   | `tsc --noEmit`                                        |
| `pnpm --filter @five-kingdoms/server build:check` | `wrangler deploy --dry-run --outdir dist` (no deploy) |

None of these log in to Cloudflare or deploy. Deploys go through `scripts/deploy.sh <env>` at the repo root,
which uses the `env` blocks in `wrangler.jsonc` (`demo`, `dev`, `staging`, `production`).

## Routes

- `POST /rooms` creates a room and returns `{ "code": "K7M2Q" }`. The code is five characters
  from an alphabet without `0 O 1 I L`. The Worker proposes a code, asks that code's Room to
  claim it (`Room.create`), and tries a new code if the room already exists.
- `GET /rooms/:code/ws` upgrades to a WebSocket handled by that Room. An unknown or expired
  room answers `404`; a request without `Upgrade: websocket` answers `426`.
- CORS is wide open (`*`), for local development and so the separately hosted web client can call `POST /rooms`.

## Message flow

1. Client opens the socket and sends `join {roomCode, name, avatar, protocolVersion, rejoinToken?}`.
2. Server answers `welcome {seat, rejoinToken, room, view, version}`. A new player gets a
   `rejoinToken` once (the server keeps only its SHA-256). A rejoin with a valid token gets the
   same seat and `rejoinToken: null`. `view` is `null` in the lobby.
3. Lobby: `ready` / `unready`, host-only `settings {maxSeats?, turnTimer?}` (seats 2-7, timer on/off) and `start`. Every change is
   announced with `roomUpdate`. `start` needs at least 2 players, all ready and connected.
4. Game: the client sends `intent {action, lastVersion}`. On success every seat receives
   `events {events, view, version}`, with events redacted for that seat and that seat's own view.
   On failure only the sender gets `error {code: 'ENGINE', engineCode, message}`. If
   `lastVersion` was behind, the sender also gets a full `view` to resync.
5. Round end: after the scoreboard each player sends `continue`. When every connected player
   has, the server deals the next round (clients never send `startNextRound`).
6. Game over: the host sends `rematch` to return to the lobby with the same seats, all unready.
7. Any time: `emote {emoteId}` is broadcast (one per second per seat); the string `ping` is
   answered with `pong` by the runtime without waking the Room.

### Disconnects

When a socket closes the seat is marked away, `presence` is broadcast, the host moves to the
next connected seat if needed, and (during a turn) the game pauses for a 60 s grace period.
Intents get `PAUSED` meanwhile. If the player returns, play resumes. After the deadline the
host may send `hostDecision {seat, decision}`:

- `wait` extends the deadline by another 60 s.
- `skip` auto-plays that seat from now on: draw from the stock and discard the drawn card
  (during final turns, `finalTurnLayDown` with no melds). If the stock cannot be drawn from, it
  draws the discard and throws a different card. The skipped player plays normally on returning.

### Turn timer

Off unless the host sends `settings {turnTimer: true}` in the lobby. While it is on, each turn
(draw and discard together) has 60 s. `roomUpdate.room.turnDeadline` is the epoch ms at which
the turn is played automatically, or `null` when no clock is running.

- On expiry the server plays the same default moves as a skipped seat: draw from the stock and
  discard the drawn card, or only the discard if the player had already drawn. The player is
  not marked skipped; their next turn is theirs.
- The clock stops while the game is paused for an away player and resumes with the time left.
- Skipped seats have no clock, because their turns are auto-played immediately.

### Storage and timers

- `room` (seats, hashed tokens, settings, pause), `game` (the full `GameState`) and `schedule`
  are written to Durable Object storage after every accepted change and reloaded in the
  constructor under `blockConcurrencyWhile`.
- Sockets use the Hibernation API; each carries its seat in `serializeAttachment`. In-memory
  state is only a cache (the emote rate limiter resets on hibernation).
- A Durable Object has one alarm. `schedule` holds named deadlines (`pause`, `turn`, `expiry`) and the
  alarm is always set to the earliest. Thirty minutes after the last socket closes (also for a
  room nobody ever joined) the room deletes all of its storage.

### Test-only knobs

`GRACE_MS`, `EXPIRY_MS` and `TURN_MS` override the 60 s grace period, 30 minute expiry and 60 s
turn. They are unset in `wrangler.jsonc`; `vitest.config.ts` sets them to 400 ms, 1.5 s and 500 ms.

## Tests

- `test/unit`: room codes, the alarm schedule, the auto-play move picker, tokens, rate
  limiting, host succession, and a CPU measurement. Plain Node Vitest.
- `test/integration`: real WebSockets against the Worker and Room through
  `@cloudflare/vitest-plugin` (room creation and 404, lobby, illegal intents, redaction, rejoin,
  host migration, pause then skip then auto-play, the turn timer, round continue, eviction mid-game, a full
  11-round game between three scripted clients, rematch, and idle expiry on a real alarm).

## Research results

### 1. Does `wrangler deploy --dry-run --outdir dist` bundle the `workspace:*` engine?

Yes. With wrangler 4.160.1 the dry run succeeds and writes a single `dist/index.js`
(43.2 KiB, 11.8 KiB gzipped) that contains `createGame`, `applyAction` (engine, imported from
TypeScript source through the workspace link) and `parseClientMessage` (protocol). No extra
bundler configuration is needed; esbuild follows the `exports` of both workspace packages.

### 2. Rough CPU time per intent

About **0.02 ms** of compute per accepted intent at a 7-player table: median 0.02 ms and p95
0.03 ms in both round 1 and round 11 (`test/unit/cpu.test.ts`). That covers the engine step,
seven redacted `events` payloads with views serialised to JSON, and the state serialised for
storage. Caveats:

- It was measured in Node/V8 on a laptop. workerd freezes its clock during synchronous work,
  so CPU time cannot be read from inside the Worker; treat it as an order of magnitude.
- It excludes storage and socket I/O, which are not CPU time.
- Even at 100x this is far below the 10 ms Workers Free CPU limit. The scripted 11-round,
  three-player game in the integration tests finishes in about a second of wall time.
