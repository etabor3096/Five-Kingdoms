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
