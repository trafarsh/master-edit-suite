/** Pure helpers for the ease curve editor. Conversion to After Effects ease lives in src/host/24-ease.jsx. */
import type { EaseCurve } from "./settings";

export type Curve = [number, number, number, number];

export const DEFAULT_EASE_PRESETS: EaseCurve[] = [
  { name: "Ease in-out", points: [0.42, 0, 0.58, 1] },
  { name: "Snappy", points: [0.7, 0, 0.2, 1] },
  { name: "Punch in", points: [0.1, 0.9, 0.2, 1] },
  { name: "Slow start", points: [0.8, 0, 0.9, 0.6] },
  { name: "Hard out", points: [0.9, 0, 0.1, 1] },
  { name: "Linear", points: [0.33, 0.33, 0.67, 0.67] },
];

/** Overshoot range for y when the toggle is on (x always stays in 0..1). */
export const OVERSHOOT_RANGE: [number, number] = [-0.5, 1.5];

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function clampCurve(c: Curve, overshoot: boolean): Curve {
  const [ylo, yhi] = overshoot ? OVERSHOOT_RANGE : [0, 1];
  return [clamp(c[0], 0, 1), clamp(c[1], ylo, yhi), clamp(c[2], 0, 1), clamp(c[3], ylo, yhi)];
}

export function hasOvershoot(c: Curve): boolean {
  return c[1] < 0 || c[1] > 1 || c[3] < 0 || c[3] > 1;
}

export function round2(c: Curve): Curve {
  return c.map((v) => Math.round(v * 100) / 100) as Curve;
}

export function cssBezier(c: Curve): string {
  return `cubic-bezier(${round2(c).join(", ")})`;
}

export function sameCurve(a: Curve, b: readonly number[], tolerance = 0.005): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
}
