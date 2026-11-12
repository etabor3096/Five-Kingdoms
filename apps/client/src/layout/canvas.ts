/** Fits the fixed 16:9 logical canvas into whatever screen we have (letterboxed, centred). */

import { CANVAS } from '../design/tokens';

export interface CanvasFit {
  scale: number;
  /** Where the scaled canvas starts inside the screen. */
  offsetX: number;
  offsetY: number;
  /** Size of the scaled canvas on screen. */
  width: number;
  height: number;
}

/**
 * Scales the logical canvas to fit inside `screenW` x `screenH` while keeping 16:9.
 * `insets` (safe areas) shrink the available area first.
 */
export function fitCanvas(
  screenW: number,
  screenH: number,
  insets: { top: number; right: number; bottom: number; left: number } = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
): CanvasFit {
  const availW = Math.max(1, screenW - insets.left - insets.right);
  const availH = Math.max(1, screenH - insets.top - insets.bottom);
  const scale = Math.min(availW / CANVAS.width, availH / CANVAS.height);
  const width = CANVAS.width * scale;
  const height = CANVAS.height * scale;
  return {
    scale,
    width,
    height,
    offsetX: insets.left + (availW - width) / 2,
    offsetY: insets.top + (availH - height) / 2,
  };
}

/** True when the screen is taller than wide, i.e. the "rotate your device" overlay applies. */
export function isPortrait(width: number, height: number): boolean {
  return height > width;
}
