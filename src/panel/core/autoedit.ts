/** Auto Edit: styles, per-run overrides and the arguments sent to the host. Format: recipes/README.md. */
import { BUNDLED_RECIPES, validateRecipe, type Recipe } from "./recipes";

export type StepId = "precompose" | "effects" | "transitionIn" | "cuts" | "extra" | "cc";
export const STEP_IDS: StepId[] = ["precompose", "effects", "transitionIn", "cuts", "extra", "cc"];
export type FrameBlend = "off" | "frameMix" | "pixelMotion";

export interface Style {
  id: string;
  name: string;
  description?: string;
  steps: Record<StepId, boolean>;
  velocity: { enabled: boolean; strength: number; frameBlend: FrameBlend };
  zoom: { enabled: boolean; amount: number; duration: number; push?: number };
  shake: { enabled: boolean; amplitude: number; frequency: number; decay: number };
  transitionIn: { type: string; strength: number };
  cuts: { type: string; intensity: number; duration: number };
  extra: { type: string; intensity: number };
  cc: { look: string; balance: boolean };
}

/** Choices the panel offers per step (PRD: Auto Edit › The six steps). */
export const TRANSITION_IN_TYPES = ["zoom-into-edit", "flash", "none"];
export const CUT_TYPES = ["flash", "shake-flash", "blur-flash", "glitch"];
export const EXTRA_TYPES = ["shake-and-flicker", "none"];

const load = (mods: Record<string, unknown>) => Object.values(mods) as unknown[];
export const BUNDLED_STYLES = load(import.meta.glob("../../../recipes/styles/*.json", { eager: true, import: "default" })) as Style[];
export const BUNDLED_LOOKS = load(import.meta.glob("../../../recipes/looks/*.json", { eager: true, import: "default" })) as Recipe[];
export const BUNDLED_EFFECTS = load(import.meta.glob("../../../recipes/effects/*.json", { eager: true, import: "default" })) as Recipe[];

export function validateStyle(s: unknown, known: { transitions: string[]; effects: string[]; looks: string[] }): string[] {
  const e: string[] = [];
  if (!s || typeof s !== "object") return ["not an object"];
  const o = s as Partial<Style>;
  const num = (v: unknown, lo: number, hi: number, at: string) => {
    if (!(typeof v === "number" && v >= lo && v <= hi)) e.push(`${at}: ${lo} to ${hi}`);
  };
  if (!o.id || !/^[a-z0-9-]+$/.test(o.id)) e.push("id: lowercase letters, digits and dashes");
  if (!o.name) e.push("name is missing");
  for (const step of STEP_IDS) if (typeof o.steps?.[step] !== "boolean") e.push(`steps.${step}: true or false`);
  num(o.velocity?.strength, 0, 0.95, "velocity.strength");
  if (!["off", "frameMix", "pixelMotion"].includes(o.velocity?.frameBlend as string)) e.push("velocity.frameBlend: off, frameMix or pixelMotion");
  num(o.zoom?.amount, 0, 100, "zoom.amount");
  num(o.zoom?.duration, 1, 120, "zoom.duration");
  num(o.shake?.amplitude, 0, 400, "shake.amplitude");
  num(o.shake?.frequency, 0.1, 60, "shake.frequency");
  num(o.shake?.decay, 0, 60, "shake.decay");
  if (o.transitionIn && o.transitionIn.type !== "none" && !known.transitions.includes(o.transitionIn.type)) e.push(`transitionIn.type: unknown "${o.transitionIn.type}"`);
  num(o.transitionIn?.strength, 0.25, 2, "transitionIn.strength");
  if (o.cuts && !known.transitions.includes(o.cuts.type)) e.push(`cuts.type: unknown "${o.cuts.type}"`);
  num(o.cuts?.intensity, 0.25, 2, "cuts.intensity");
  num(o.cuts?.duration, 2, 60, "cuts.duration");
  if (o.extra && o.extra.type !== "none" && !known.effects.includes(o.extra.type)) e.push(`extra.type: unknown "${o.extra.type}"`);
  num(o.extra?.intensity, 0, 2, "extra.intensity");
  if (!o.cc || !known.looks.includes(o.cc.look)) e.push(`cc.look: unknown "${o.cc?.look}"`);
  return e;
}

/** What the user changed for this run on top of the chosen style. */
export interface Overrides {
  steps?: Partial<Record<StepId, boolean>>;
  velocity?: boolean;
  zoom?: boolean;
  shake?: boolean;
  /** Use another style's parameters for the effects step only. */
  effectsStyleId?: string;
  transitionInType?: string;
  cutsType?: string;
  extraType?: string;
  balance?: boolean;
  overwriteTimeRemap?: boolean;
}

export interface Catalog {
  styles: Style[];
  transitions: Recipe[];
  effects: Recipe[];
  looks: Recipe[];
}

export function bundledCatalog(transitions: Recipe[] = BUNDLED_RECIPES): Catalog {
  return { styles: BUNDLED_STYLES, transitions, effects: BUNDLED_EFFECTS, looks: BUNDLED_LOOKS };
}

/** The style as it will run, with the user's overrides applied. */
export function effectiveStyle(style: Style, o: Overrides, catalog: Catalog): Style {
  const fxStyle = (o.effectsStyleId && catalog.styles.find((s) => s.id === o.effectsStyleId)) || style;
  return {
    ...style,
    steps: { ...style.steps, ...o.steps },
    velocity: { ...fxStyle.velocity, enabled: o.velocity ?? fxStyle.velocity.enabled },
    zoom: { ...fxStyle.zoom, enabled: o.zoom ?? fxStyle.zoom.enabled },
    shake: { ...fxStyle.shake, enabled: o.shake ?? fxStyle.shake.enabled },
    transitionIn: { ...style.transitionIn, type: o.transitionInType ?? style.transitionIn.type },
    cuts: { ...style.cuts, type: o.cutsType ?? style.cuts.type },
    extra: { ...style.extra, type: o.extraType ?? style.extra.type },
    cc: { ...style.cc, balance: o.balance ?? style.cc.balance },
  };
}

export interface BalanceOptions {
  target: number;
  strength: number;
  tameBright: boolean;
}

/** Arguments for the host's autoedit.run. Recipes travel with the call, so the host needs no file access. */
export function buildRunArgs(
  s: Style,
  catalog: Catalog,
  clipIds: number[],
  extras: { overwriteTimeRemap?: boolean; balance: BalanceOptions },
) {
  const find = (list: Recipe[], id: string) => list.find((r) => r.id === id) ?? null;
  const steps = { ...s.steps };
  // A step whose recipe is "none" adds nothing, exactly like a switched-off step.
  if (s.transitionIn.type === "none") steps.transitionIn = false;
  if (s.extra.type === "none") steps.extra = false;
  return {
    clipIds,
    steps,
    effects: {
      velocity: s.velocity,
      zoom: s.zoom,
      shake: s.shake,
      overwriteTimeRemap: !!extras.overwriteTimeRemap,
    },
    transitionIn: steps.transitionIn ? { recipe: find(catalog.transitions, s.transitionIn.type), strength: s.transitionIn.strength } : null,
    cuts: steps.cuts ? { recipe: find(catalog.transitions, s.cuts.type), intensity: s.cuts.intensity, duration: s.cuts.duration } : null,
    extra: steps.extra ? { recipe: find(catalog.effects, s.extra.type), intensity: s.extra.intensity } : null,
    cc: steps.cc ? { recipe: find(catalog.looks, s.cc.look), balance: s.cc.balance, balanceOptions: extras.balance } : null,
  };
}

/** What autoedit.inspect returns about the edit part. */
export interface EditPart {
  ids: number[];
  names: string[];
  clips: number;
  start: number;
  end: number;
  switches: number[];
  needPrecompose: number;
  shortClips: string[];
  stills: string[];
  timeRemapped: string[];
  overlaps: string[];
  hasIntro: boolean;
  notes: string[];
}

export function nameOf(id: string, list: { id: string; name: string }[]): string {
  if (id === "none") return "None";
  return list.find((x) => x.id === id)?.name ?? id;
}

/** One-line summary per step row. */
export function stepSummary(step: StepId, s: Style, part: EditPart | null, catalog: Catalog): string {
  const n = part?.clips ?? 0;
  switch (step) {
    case "precompose":
      if (!part) return "Each clip into its own trimmed precomp";
      return part.needPrecompose ? `${part.needPrecompose} of ${n} clips still need it` : "Every clip is already a precomp";
    case "effects": {
      const on = [s.velocity.enabled && "velocity", s.zoom.enabled && "zooms", s.shake.enabled && "shake"].filter(Boolean);
      return on.length ? `Per clip: ${on.join(", ")}` : "Nothing selected";
    }
    case "transitionIn":
      if (s.transitionIn.type === "none") return "None";
      if (part && !part.hasIntro) return "Skipped: nothing before the edit part";
      return nameOf(s.transitionIn.type, catalog.transitions);
    case "cuts": {
      const k = part ? part.switches.length : null;
      if (k === 0) return "Skipped: only one clip";
      return `${nameOf(s.cuts.type, catalog.transitions)}${k ? ` at ${k} ${k === 1 ? "switch" : "switches"}` : " at every switch"}`;
    }
    case "extra":
      return s.extra.type === "none" ? "None" : `${nameOf(s.extra.type, catalog.effects)} over the edit part`;
    case "cc":
      return `${s.cc.balance ? "Balance brightness, then " : ""}${nameOf(s.cc.look, catalog.looks)} grade`;
  }
}

export function validateCatalog(c: Catalog): string[] {
  const known = { transitions: c.transitions.map((r) => r.id), effects: c.effects.map((r) => r.id), looks: c.looks.map((r) => r.id) };
  const errors: string[] = [];
  for (const r of [...c.effects, ...c.looks]) validateRecipe(r).forEach((e) => errors.push(`${r.id}: ${e}`));
  for (const s of c.styles) validateStyle(s, known).forEach((e) => errors.push(`${s.id}: ${e}`));
  return errors;
}
