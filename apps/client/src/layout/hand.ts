/** Fans the viewer's hand along the bottom of the canvas. */

import { CANVAS } from '../design/tokens';

export interface FanCard {
  /** Left edge of the card, logical pixels. */
  x: number;
  /** Top edge of the card, logical pixels. */
  y: number;
  /** Rotation in degrees about the card's centre. */
  rotate: number;
}

export const HAND_AREA = { centerX: CANVAS.width / 2 + 10, maxWidth: 780, baseY: 536 } as const;

/**
 * Returns one position per card for a hand of `count` cards, centred in the hand area.
 * Cards overlap more as the hand grows so a 13-card hand still fits; the fan arcs gently.
 */
export function handFan(count: number, cardWidth: number): FanCard[] {
  if (count <= 0) return [];
  const step =
    count === 1 ? 0 : Math.min(cardWidth * 0.78, (HAND_AREA.maxWidth - cardWidth) / (count - 1));
  const mid = (count - 1) / 2;
  const totalWidth = step * (count - 1) + cardWidth;
  const left = HAND_AREA.centerX - totalWidth / 2;
  return Array.from({ length: count }, (_, i) => {
    const d = i - mid;
    const norm = mid === 0 ? 0 : d / mid; // -1..1
    return {
      x: left + i * step,
      y: HAND_AREA.baseY + 26 * norm * norm,
      rotate: norm * 9,
    };
  });
}
