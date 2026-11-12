# ADR 0001: pnpm monorepo, all TypeScript

Status: Accepted

## Context

The project has a shared rules engine, a client, a server, and a desktop shell. The engine must be used identically by the client and the server. A solo owner and automated agents will work on several packages in parallel, with one PR per feature.

## Decision

Use a single pnpm workspace monorepo, written entirely in TypeScript:

- `packages/engine`: pure rules engine
- `apps/client`: Expo + React Native + react-native-web
- `apps/server`: Cloudflare Workers + Durable Objects
- `apps/desktop`: Electron shell

Shared tooling (TypeScript, lint, format, tests) is configured at the root. CI runs typecheck, lint, format check and tests across the workspace.

## Consequences

- One language and one dependency manager. The engine is imported directly with no publishing step.
- Atomic changes across engine, server and client in one PR.
- Expo/Metro and Workers bundling both need care with pnpm's symlinked `node_modules`; the client may need Metro config for workspace packages.
- Package boundaries must be kept deliberately (the engine may not import from apps).
