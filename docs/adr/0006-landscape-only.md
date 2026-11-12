# ADR 0006: Landscape-only on every device

Status: Accepted

## Context

A card table with seven players around it, a large hand, two piles, and an emote bar needs width. Supporting both orientations roughly doubles layout and testing work.

## Decision

v1 is landscape-only on every device. Layouts are designed for a wide table only.

## Consequences

- One layout family to design, build and test, and a more table-like feel.
- Orientation can be locked in native apps and Electron. iOS Safari and home-screen PWAs do not reliably honour locks, so the app shows a rotate-your-device overlay in portrait.
- Phones with small heights need careful sizing of the hand and controls.
- Portrait support, if wanted later, is a new layout project and would supersede this ADR.
