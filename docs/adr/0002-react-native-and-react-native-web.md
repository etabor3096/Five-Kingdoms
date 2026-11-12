# ADR 0002: React Native + react-native-web as the single UI codebase

Status: Accepted

## Context

We want the game on the web (iPhone PWA), on desktop, and later as native iOS and Android apps, maintained by one person. The UI is animation-heavy (dealing, drawing, discarding) and mostly custom-drawn.

## Decision

Build the UI once with Expo and React Native, and use react-native-web for the web target. Desktop uses the web build inside Electron ([ADR 0003](0003-web-pwa-and-electron-mvp.md)). Native iOS and Android come from the same code via Expo later.

## Consequences

- One UI codebase for every platform, and native apps remain open without a rewrite.
- Web output of React Native can be heavier and less idiomatic than a web-first stack, and animation performance must be checked on web early.
- Libraries must be chosen for web, iOS and Android support. Avoid iOS-only choices.
- Landscape-only layout ([ADR 0006](0006-landscape-only.md)) simplifies responsive design across targets.
