# ADR 0007: Guest-first identity

Status: Accepted

## Context

The audience is family and friends who just want to join a game. Accounts add sign-up friction, password and data-protection obligations, and a database. Players still need to rejoin their seat after disconnecting.

## Decision

Identity in v1 is a display name and an avatar, remembered on the device. Joining a room also issues a random rejoin token stored on the device and bound to the player's seat, which lets them reclaim it after a disconnect. Accounts, profile customization and stats come later.

## Consequences

- Zero sign-up friction and no stored personal data beyond a display name and avatar.
- No cross-device identity. Switching devices mid-game is not supported in v1 (the old token holds the seat).
- Name impersonation is possible; acceptable for a private friends-and-family scope, and room codes are the access control.
- Adding accounts later means linking existing guest data to an account, so the data model keeps a stable player id separate from the display name.
