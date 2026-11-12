import { describe, expect, it } from 'vitest';
import { CANVAS } from '../src/design/tokens';
import { fitCanvas, isPortrait } from '../src/layout/canvas';
import { handFan } from '../src/layout/hand';
import { seatLayout } from '../src/layout/seats';

describe('fitCanvas', () => {
  it('keeps 16:9 and centres (letterbox on a taller screen)', () => {
    const fit = fitCanvas(1280, 1000);
    expect(fit.scale).toBe(1);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe((1000 - 720) / 2);
    expect(fit.width / fit.height).toBeCloseTo(16 / 9);
  });

  it('pillarboxes on a wider screen and scales down on a phone', () => {
    const wide = fitCanvas(2000, 720);
    expect(wide.scale).toBe(1);
    expect(wide.offsetX).toBe((2000 - 1280) / 2);
    const phone = fitCanvas(844, 390);
    expect(phone.scale).toBeCloseTo(390 / 720);
    expect(phone.height).toBeCloseTo(390);
  });

  it('shrinks the available area by safe-area insets', () => {
    const fit = fitCanvas(844, 390, { top: 0, bottom: 20, left: 47, right: 47 });
    expect(fit.scale).toBeCloseTo(370 / 720);
    expect(fit.offsetX).toBeGreaterThanOrEqual(47);
    expect(fit.offsetX + fit.width).toBeLessThanOrEqual(844 - 47 + 1e-9);
  });

  it('detects portrait', () => {
    expect(isPortrait(390, 844)).toBe(true);
    expect(isPortrait(844, 390)).toBe(false);
    expect(isPortrait(500, 500)).toBe(false);
  });
});

describe('seatLayout', () => {
  for (let n = 2; n <= 7; n++) {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    for (const viewer of [ids[0], ids[n - 1]] as string[]) {
      it(`places ${n} players inside the canvas without overlap (viewer ${viewer})`, () => {
        const slots = seatLayout(ids, viewer);
        expect(slots).toHaveLength(n);
        expect(new Set(slots.map((s) => s.playerId)).size).toBe(n);
        expect(slots.filter((s) => s.isSelf)).toHaveLength(1);
        expect(slots[0]?.playerId).toBe(viewer);
        for (const s of slots) {
          expect(s.x).toBeGreaterThan(60);
          expect(s.x).toBeLessThan(CANVAS.width - 60);
          expect(s.y).toBeGreaterThan(40);
          expect(s.y).toBeLessThan(CANVAS.height - 40);
        }
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const a = slots[i]!;
            const b = slots[j]!;
            expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(130);
          }
        }
      });
    }
  }

  it('seats follow turn order clockwise: the next player is to the left of the viewer', () => {
    const slots = seatLayout(['a', 'b', 'c', 'd'], 'a');
    const next = slots.find((s) => s.playerId === 'b')!;
    const last = slots.find((s) => s.playerId === 'd')!;
    expect(next.x).toBeLessThan(CANVAS.width / 2);
    expect(last.x).toBeGreaterThan(CANVAS.width / 2);
  });

  it('puts the lone opponent at the top centre in a 2-player game', () => {
    const [, other] = seatLayout(['a', 'b'], 'a');
    expect(other!.x).toBeCloseTo(CANVAS.width / 2);
    expect(other!.y).toBeLessThan(120);
  });

  it('keeps opponents clear of the centre piles', () => {
    for (let n = 2; n <= 7; n++) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      for (const s of seatLayout(ids, 'p0').slice(1)) {
        const away = Math.hypot(s.x - CANVAS.width / 2, s.y - 330);
        expect(away).toBeGreaterThan(200);
      }
    }
  });
});

describe('handFan', () => {
  it('is empty for no cards and centred for one', () => {
    expect(handFan(0, 96)).toEqual([]);
    const [only] = handFan(1, 96);
    expect(only!.rotate).toBe(0);
  });

  for (const n of [3, 8, 13, 14]) {
    it(`fits ${n} cards inside the canvas, in order, without gaps`, () => {
      const fan = handFan(n, 96);
      expect(fan).toHaveLength(n);
      expect(fan[0]!.x).toBeGreaterThanOrEqual(0);
      expect(fan[n - 1]!.x + 96).toBeLessThanOrEqual(CANVAS.width);
      for (let i = 1; i < n; i++) {
        const gap = fan[i]!.x - fan[i - 1]!.x;
        expect(gap).toBeGreaterThan(0);
        expect(gap).toBeLessThanOrEqual(96); // cards never leave a hole
      }
      expect(fan[0]!.rotate).toBeLessThan(0);
      expect(fan[n - 1]!.rotate).toBeGreaterThan(0);
    });
  }
});
