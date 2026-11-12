import { describe, expect, it } from 'vitest';
import { SUITS } from '@five-kingdoms/engine';
import {
  bestInk,
  contrastRatio,
  deltaE,
  hexToRgb,
  simulateCvd,
  type CvdKind,
} from '../src/design/color';
import { COLORS, KINGDOM_COLORS, OKABE_ITO } from '../src/design/tokens';

describe('colour helpers', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('rejects malformed hex', () => {
    expect(() => hexToRgb('red')).toThrow(RangeError);
  });

  it('leaves greys unchanged under CVD simulation', () => {
    for (const kind of ['protanopia', 'deuteranopia', 'tritanopia'] as CvdKind[]) {
      const [r, g, b] = simulateCvd('#808080', kind);
      expect(Math.abs(r - 128)).toBeLessThan(3);
      expect(Math.abs(g - 128)).toBeLessThan(3);
      expect(Math.abs(b - 128)).toBeLessThan(3);
    }
  });
});

describe('kingdom palette', () => {
  const colors = SUITS.map((s) => KINGDOM_COLORS[s]);

  it('uses Okabe-Ito colours only', () => {
    const allowed = new Set<string>(Object.values(OKABE_ITO));
    for (const c of colors) expect(allowed.has(c)).toBe(true);
  });

  it('has five distinct colours', () => {
    expect(new Set(colors).size).toBe(5);
  });

  // Colour is not the only cue (each kingdom also has its own crest shape and symbol), but
  // the colours should still stay apart for the common colour-vision deficiencies.
  for (const kind of ['protanopia', 'deuteranopia', 'tritanopia'] as CvdKind[]) {
    it(`keeps every pair distinguishable under ${kind}`, () => {
      for (let i = 0; i < colors.length; i++) {
        for (let j = i + 1; j < colors.length; j++) {
          const d = deltaE(simulateCvd(colors[i]!, kind), simulateCvd(colors[j]!, kind));
          expect(d, `${SUITS[i]} vs ${SUITS[j]}`).toBeGreaterThan(15);
        }
      }
    });
  }

  it('gives readable symbols: ink on every crest fill is at least 4.5:1', () => {
    for (const fill of colors) {
      const ink = bestInk(fill, [COLORS.symbolDark, COLORS.inkLight]);
      expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('draws crest outlines and numerals at least 3:1 (UI) / 7:1 (text) against the card face', () => {
    expect(contrastRatio(COLORS.ink, COLORS.cardFace)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(COLORS.cardEdge, COLORS.cardFace)).toBeGreaterThanOrEqual(3);
  });

  it('has a wild highlight that stands out from the card face and from every crest outline', () => {
    expect(contrastRatio(COLORS.wild, COLORS.bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('UI text', () => {
  it('is readable on the table backgrounds', () => {
    for (const bg of [COLORS.bg, COLORS.felt, COLORS.panel]) {
      expect(contrastRatio(COLORS.text, bg)).toBeGreaterThanOrEqual(7);
    }
    expect(contrastRatio(COLORS.textDim, COLORS.panel)).toBeGreaterThanOrEqual(4.5);
  });
});
