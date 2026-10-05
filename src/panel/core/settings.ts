/** Settings schema, defaults and validation. Pure: storage lives in node/settingsStore.ts. */

export interface EaseCurve {
  name: string;
  /** cubic-bezier(x1, y1, x2, y2) */
  points: [number, number, number, number];
}

export const TEXTURE_BLENDS = ["SCREEN", "ADD", "OVERLAY", "SOFT_LIGHT", "MULTIPLY", "NORMAL"] as const;
export type TextureBlend = (typeof TEXTURE_BLENDS)[number];

export interface Settings {
  version: 1;
  /** Root of library/<tab>/<category>/<item>. Empty = not set yet. */
  libraryPath: string;
  /** Where Render and convert / Save frame write. Empty = <Videos>/Master Edit Suite. */
  outputFolder: string;
  /** Explicit ffmpeg binary. Empty = bundled bin/ffmpeg, then PATH. */
  ffmpegPath: string;
  /** Output module template for the intermediate render. */
  renderTemplate: string;
  /** x264 constant rate factor for MP4 output (lower = better). */
  mp4Crf: number;
  fadeSeconds: number;
  fadeFloorDb: number;
  volumeStepDb: number;
  staircaseOverlapFrames: number;
  /** Selection poll interval; CEP has no selection-change event. */
  pollMs: number;
  resizeMode: "fit" | "fill";
  fxScope: "comp" | "selected";
  presetStretch: boolean;
  presetAtLayerStart: boolean;
  textureBlend: TextureBlend;
  lastModule: string;
  easePresets: EaseCurve[];
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  libraryPath: "",
  outputFolder: "",
  ffmpegPath: "",
  renderTemplate: "Lossless",
  mp4Crf: 18,
  fadeSeconds: 0.5,
  fadeFloorDb: -48,
  volumeStepDb: 3,
  staircaseOverlapFrames: 0,
  pollMs: 1000,
  resizeMode: "fit",
  fxScope: "comp",
  presetStretch: false,
  presetAtLayerStart: false,
  textureBlend: "SCREEN",
  lastModule: "general",
  easePresets: [],
};

type NumberKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];

export const NUMBER_LIMITS: Record<Exclude<NumberKey, "version">, [number, number]> = {
  mp4Crf: [0, 51],
  fadeSeconds: [0.01, 30],
  fadeFloorDb: [-96, -6],
  volumeStepDb: [0.1, 24],
  staircaseOverlapFrames: [0, 600],
  pollMs: [250, 10000],
};

function clamp(n: number, [lo, hi]: [number, number]) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Merges stored (possibly old, partial or hand-edited) settings over the defaults.
 * Unknown keys are dropped and every value is type-checked and clamped, so a bad
 * file can never break the panel.
 */
export function normalizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, easePresets: [] };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const key of ["libraryPath", "outputFolder", "ffmpegPath", "renderTemplate", "lastModule"] as const) {
    if (typeof r[key] === "string") out[key] = (r[key] as string).trim();
  }
  if (!out.renderTemplate) out.renderTemplate = DEFAULT_SETTINGS.renderTemplate;
  for (const key of Object.keys(NUMBER_LIMITS) as (keyof typeof NUMBER_LIMITS)[]) {
    const v = r[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = clamp(v, NUMBER_LIMITS[key]);
  }
  out.mp4Crf = Math.round(out.mp4Crf);
  out.staircaseOverlapFrames = Math.round(out.staircaseOverlapFrames);
  if (r.resizeMode === "fit" || r.resizeMode === "fill") out.resizeMode = r.resizeMode;
  if (r.fxScope === "comp" || r.fxScope === "selected") out.fxScope = r.fxScope;
  if (typeof r.presetStretch === "boolean") out.presetStretch = r.presetStretch;
  if (typeof r.presetAtLayerStart === "boolean") out.presetAtLayerStart = r.presetAtLayerStart;
  if (TEXTURE_BLENDS.includes(r.textureBlend as TextureBlend)) out.textureBlend = r.textureBlend as TextureBlend;
  if (Array.isArray(r.easePresets)) {
    out.easePresets = r.easePresets.filter(
      (p): p is EaseCurve =>
        !!p &&
        typeof p.name === "string" &&
        Array.isArray(p.points) &&
        p.points.length === 4 &&
        p.points.every((n: unknown) => typeof n === "number" && Number.isFinite(n)),
    );
  }
  return out;
}
