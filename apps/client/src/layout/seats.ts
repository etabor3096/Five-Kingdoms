/** Seat placement around the table for 2 to 7 players, in logical canvas coordinates. */

import { CANVAS } from '../design/tokens';

export interface SeatSlot {
  playerId: string;
  /** Centre of the seat's avatar. */
  x: number;
  y: number;
  isSelf: boolean;
}

/** Centre and radii of the ellipse the seats sit on. */
export const SEAT_RING = {
  cx: CANVAS.width / 2,
  cy: 300,
  rx: 520,
  ry: 235,
} as const;

/** Where the viewer's own seat badge goes (their hand fans below it). */
export const SELF_SEAT = { x: 110, y: 640 } as const;

/**
 * Places every player. The viewer sits at the bottom; the others follow in seat order,
 * clockwise on screen, spread evenly over the remaining arc. Opponents avoid the bottom
 * strip so they never collide with the viewer's hand.
 */
export function seatLayout(playerIds: readonly string[], viewerId: string): SeatSlot[] {
  const selfIdx = Math.max(0, playerIds.indexOf(viewerId));
  const n = playerIds.length;
  const others = n - 1;
  const slots: SeatSlot[] = [];
  for (let k = 0; k < n; k++) {
    const id = playerIds[(selfIdx + k) % n] as string;
    if (k === 0) {
      slots.push({ playerId: id, x: SELF_SEAT.x, y: SELF_SEAT.y, isSelf: true });
      continue;
    }
    // Screen angles in degrees, y down: 90 = bottom, 180 = left, 270 = top, 360 = right.
    // Opponents occupy 150..390 (left-bottom, over the top, to right-bottom).
    const t = others === 1 ? 0.5 : (k - 1) / (others - 1);
    const deg = others === 1 ? 270 : 150 + 240 * t;
    const rad = (deg * Math.PI) / 180;
    slots.push({
      playerId: id,
      x: SEAT_RING.cx + SEAT_RING.rx * Math.cos(rad),
      y: SEAT_RING.cy + SEAT_RING.ry * Math.sin(rad),
      isSelf: false,
    });
  }
  return slots;
}
