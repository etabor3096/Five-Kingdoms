# ADR 0003: Web/PWA plus Electron as the MVP distribution

Status: Accepted

## Context

The game is for family and friends only, with no public store release planned. Distributing a native iOS app requires the $99/yr Apple Developer Program (TestFlight included). Store publishing is out of scope for now.

## Decision

The MVP ships as:

- a web/PWA build (iPhone users use Add to Home Screen),
- macOS and Windows desktop apps using Electron around the web build, unsigned for now.

A native iOS app via Expo and TestFlight follows when the owner pays for the Apple Developer Program. Until then it is tested in the iOS simulator. Android comes after the MVP.

## Consequences

- No recurring cost for the MVP, and friends can play from a link.
- iOS PWAs have limits: no enforced orientation lock, audio needs a user gesture, background tabs suspend sockets, and no reliable push.
- Unsigned desktop apps trigger Gatekeeper and SmartScreen warnings; friends need install instructions.
- A public release later needs signing, store accounts, and a trademark check on the name ("Five Crowns" is a Set Enterprises/PlayMonster trademark).
