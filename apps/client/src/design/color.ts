/** Small colour utilities: WCAG contrast and colour-vision-deficiency (CVD) simulation. */

export type Rgb = readonly [number, number, number];

/** Parses `#rrggbb` into 0-255 channels. */
export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new RangeError(`Expected #rrggbb, got ${hex}`);
  const n = parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toLinear = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Returns whichever of `candidates` has the best contrast against `background`. */
export function bestInk(background: string, candidates: readonly string[]): string {
  let best = candidates[0] as string;
  for (const c of candidates) {
    if (contrastRatio(c, background) > contrastRatio(best, background)) best = c;
  }
  return best;
}

export type CvdKind = 'protanopia' | 'deuteranopia' | 'tritanopia';

/** Linear-RGB matrices from Machado, Oliveira & Fernandes (2009), severity 1.0. */
const CVD_MATRICES: Record<CvdKind, readonly (readonly number[])[]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const fromLinear = (c: number): number => {
  const v = Math.min(1, Math.max(0, c));
  return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
};

/** Approximates how `hex` appears to someone with the given colour-vision deficiency. */
export function simulateCvd(hex: string, kind: CvdKind): Rgb {
  const lin = hexToRgb(hex).map(toLinear);
  const m = CVD_MATRICES[kind];
  const out = m.map((row) => row.reduce((sum, k, i) => sum + k * (lin[i] as number), 0));
  return out.map(fromLinear) as unknown as Rgb;
}

/** CIE Lab (D65) from sRGB 0-255. */
function toLab([r, g, b]: Rgb): [number, number, number] {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)] as const;
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference between two sRGB colours (about 2.3 is a just-noticeable difference). */
export function deltaE(a: Rgb, b: Rgb): number {
  const [la, lb] = [toLab(a), toLab(b)];
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}
