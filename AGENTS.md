# Five Kingdoms

Online Five Crowns for family and friends, with UI inspired by Ubisoft UNO and original art. Private for now. You may be one of several agents working in parallel, so stay inside your task's scope: edit only the packages it names.

## Repo map

| Path                | Responsibility                                                                         | Start at                                                          |
| ------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/engine`   | Pure rules: reducer, meld solver, seeded RNG, redacted views                           | `src/index.ts`, `game.ts` (`createGame`/`applyAction`), `view.ts` |
| `packages/protocol` | Wire types and the client-message validator                                            | `src/messages.ts`, `validate.ts` (`parseClientMessage`)           |
| `apps/server`       | Cloudflare Worker plus the `Room` Durable Object (one per room)                        | `src/index.ts`, `room.ts`, `schedule.ts`                          |
| `apps/client`       | Expo + React Native + react-native-web UI for web/PWA; `LocalGameClient` for dev       | `app/`, `src/screens/AppFlow.tsx`, `src/net/RemoteGameClient.ts`  |
| `apps/desktop`      | Electron shell around the web build. Not created yet; do not scaffold it unless asked. |                                                                   |

## Commands

Run from the repo root. Node >= 22, pnpm via Corepack (version pinned in `package.json`).

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test   # `pnpm format` fixes formatting
pnpm --filter @five-kingdoms/server dev        # http://localhost:8787 (local only, never deploys)
pnpm --filter @five-kingdoms/server build:check  # wrangler dry-run bundle
pnpm --filter @five-kingdoms/client web        # http://localhost:8081
pnpm --filter @five-kingdoms/client export:web   # static build into apps/client/dist
scripts/deploy.sh demo                         # deploy one environment (owner's request only)
```

Two-browser local play: start both servers, open `localhost:8081/?profile=a` and `localhost:8081/?profile=b` (separate name and rejoin tokens, like two devices). `?dev=1` (or `EXPO_PUBLIC_DEV_HARNESS=1`) swaps in the offline in-memory harness. `EXPO_PUBLIC_SERVER_URL` points the client elsewhere.

## The gate

Green before you finish any task:

```sh
pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

## Architecture rules

- **Engine is pure.** No I/O, no `Math.random`, no `Date`, JSON-safe state, zero runtime deps. Randomness comes from the seeded RNG.
- **Server is authoritative.** Clients only receive `viewFor` output and redacted events (`redactEvents`), never raw `GameState`.
- **Never trust client JSON.** Every inbound message goes through `parseClientMessage`.
- **Bump `PROTOCOL_VERSION`** (`packages/protocol/src/messages.ts`) on any breaking wire change.
- **Durable Object state lives in storage.** Hibernation wipes memory, so in-memory fields are caches only. A DO has one alarm; named deadlines go through the `schedule` and the alarm is set to the earliest.
- **Rules interpretations and house rules are `RulesConfig` flags** (`packages/engine/src/rules.ts`), never hard-coded.
- **Client is landscape-only on a fixed 1280×720 canvas** (`CANVAS` in `src/design/tokens.ts`), scaled to fit.
- **`LocalGameClient` + `devBot` are a dev harness**, not the product bot.

## Rules source of truth

`docs/rules.md`. The owner accepted every default interpretation and open-question answer in SDD §16 on 2026-11-11; implement those, behind config flags.

## Conventions

- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:` ...).
- **Never add Claude or AI attribution** to commits, PRs or code: no `Co-Authored-By` trailer, no "Generated with" line, no session links. The owner's hard rule.
- Small, readable modules with doc comments: the owner reads the code.
- Every rule or behaviour change ships with tests.

## Branches

Promotion chain: **`demo` → `dev` → `staging` → `main`**. Each branch has its own Cloudflare environment (`main` is `production`).

- Feature, fix and docs PRs target `demo`. Squash-merge them.
- Promotion PRs go one step up the chain (`demo` → `dev`, `dev` → `staging`, `staging` → `main`) and use a **merge commit**, never a squash, so the branches share history and the next promotion shows only new work.
- Promote past `dev`, or deploy anything, only on the owner's request.
- Never stack a PR on another open PR's branch: when the parent merges, the child merges into a dead branch (this lost PR #6 once). Wait for the parent to merge, then branch from `demo`.

## Deploy

- `scripts/deploy.sh <demo|dev|staging|production>` deploys the room server Worker, builds the web client against its URL, and deploys the web Worker. It refuses to run off the environment's branch unless `ALLOW_ANY_BRANCH=1`.
- Auth is `wrangler login` or `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (gitignored `.env`). Agents get the token from the owner only when a deploy is requested; never print or commit it.
- First-time account setup is `scripts/deploy-wizard.sh`, run by the owner.
- Worker names: `five-kingdoms-server-<env>` and `five-kingdoms-web-<env>` (`apps/server/wrangler.jsonc`, `apps/client/wrangler.jsonc`).

## Gotchas

- TypeScript is pinned to 6.x: typescript-eslint doesn't support TS 7 yet.
- pnpm 12 needs `allowBuilds` (esbuild, workerd) and `minimumReleaseAgeExclude` entries for brand-new packages in `pnpm-workspace.yaml`.
- Server integration tests use `@cloudflare/vitest-plugin`, not the deprecated `vitest-pool-workers`.
- Add Expo packages with `npx expo install` so versions match the SDK.
- iOS can't lock orientation, so the rotate overlay (`RotateOverlay.tsx`) is required.
- Unsigned Windows builds may be blocked by Smart App Control.
- iPhone sockets die silently in the background; the client sends `ping` on `visibilitychange` and reconnects if no `pong`.
- Hosting must stay on the free tier (Workers Free: 10 ms CPU per request).

## Docs map

- `docs/SDD.md`: design, goals, milestones, open questions
- `docs/rules.md`: game rules spec
- `docs/GLOSSARY.md`: domain terms
- `docs/adr/`: decisions (pnpm monorepo, RN + web, Durable Objects, server-authoritative, landscape-only ...)
- `docs/research/platform-stack.md`: platform and hosting research
- `apps/server/README.md`: the real wire protocol, routes, storage and timers
- The client has no README; the root `README.md` covers local play.

**Code and `apps/server/README.md` win over the SDD.** SDD §9 is stale: the protocol has a `continue` message (not an `intent` acknowledgement), is a separate `packages/protocol` package, `ping`/`pong` is a runtime string reply, and `skip` is the only implemented host decision besides `wait` (no bot handover yet). Flag further drift in your PR; the SDD needs a follow-up update.
