# Five Kingdoms

An online, real-time multiplayer version of the card game Five Crowns, built for family and
friends. The game rules live in a pure TypeScript engine (`packages/engine`) that will run on the
authoritative server (Cloudflare Workers / Durable Objects) and in the React Native + web client.

## Layout

- `packages/engine` – `@five-kingdoms/engine`: deterministic, dependency-free rules engine.
- `apps/` – server and client apps (to come).

## Development

Requires Node >= 22 (see `.nvmrc`) and pnpm (version pinned in `package.json`; use Corepack).

```sh
pnpm install            # install dependencies
pnpm typecheck          # tsc across the workspace
pnpm lint              # ESLint (typescript-eslint, type-aware)
pnpm format:check       # Prettier check (pnpm format to fix)
pnpm test               # Vitest across the workspace
```

## Playing locally against the real server

```sh
pnpm install
pnpm --filter @five-kingdoms/server dev      # room server on http://localhost:8787
pnpm --filter @five-kingdoms/client web      # web client on http://localhost:8081
```

Open two tabs. `?profile=a` and `?profile=b` keep each tab's name and rejoin tokens separate,
so the two tabs behave like two devices: `localhost:8081/?profile=a` and
`localhost:8081/?profile=b`. One creates a room; the other joins with the code.

- `EXPO_PUBLIC_SERVER_URL` points the client at another server (default `http://localhost:8787`).
- `?dev=1` (web) or `EXPO_PUBLIC_DEV_HARNESS=1` swaps in the offline in-memory harness.
