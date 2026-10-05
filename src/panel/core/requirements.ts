/**
 * Selection awareness: decides whether an action can run on the current host
 * state, what it will act on ("3 layers") and, when it cannot run, why.
 */
import type { HostState, LayerInfo, LayerKind } from "../bridge/types";
import { plural } from "./format";

export interface Availability {
  enabled: boolean;
  /** What the action will act on, e.g. "3 layers". Shown on the button. */
  target: string;
  /** Why the action is disabled, e.g. "Select at least one footage layer". */
  reason?: string;
  layers: LayerInfo[];
}

const NO_STATE: Availability = { enabled: false, target: "", reason: "Connecting to After Effects…", layers: [] };

export function needsComp(state: HostState | null): Availability {
  if (!state) return NO_STATE;
  if (!state.comp) return { enabled: false, target: "", reason: "Open a composition first", layers: [] };
  return { enabled: true, target: state.comp.name, layers: [] };
}

export function needsProject(state: HostState | null): Availability {
  if (!state) return NO_STATE;
  if (!state.project) return { enabled: false, target: "", reason: "Open a project first", layers: [] };
  return { enabled: true, target: state.project.name, layers: [] };
}

export interface LayerRule {
  min?: number;
  kinds?: LayerKind[];
  /** Extra filter, e.g. layers with audio. */
  where?: (l: LayerInfo) => boolean;
  /** Noun for the target and reason, e.g. "footage layer". Default "layer". */
  noun?: string;
  /** Locked layers are skipped by the host, so they never count. */
  allowLocked?: boolean;
}

export function needsLayers(state: HostState | null, rule: LayerRule = {}): Availability {
  const comp = needsComp(state);
  if (!comp.enabled || !state) return comp;
  const min = rule.min ?? 1;
  const noun = rule.noun ?? "layer";
  const matching = state.selection.filter(
    (l) =>
      (!rule.kinds || rule.kinds.includes(l.kind)) &&
      (!rule.where || rule.where(l)) &&
      (rule.allowLocked || !l.locked),
  );
  if (matching.length < min) {
    const what = min === 1 ? `at least one ${noun}` : `at least ${min} ${noun}s`;
    const lockedHint = !rule.allowLocked && state.selection.some((l) => l.locked) ? " (locked layers don't count)" : "";
    return { enabled: false, target: "", reason: `Select ${what}${lockedHint}`, layers: matching };
  }
  return { enabled: true, target: plural(matching.length, noun), layers: matching };
}

export const VISUAL_KINDS: LayerKind[] = ["footage", "still", "precomp", "text", "shape", "solid"];
export const CLIP_KINDS: LayerKind[] = ["footage", "still", "precomp"];

export const rules = {
  anyLayer: { noun: "layer" } satisfies LayerRule,
  twoLayers: { min: 2, noun: "layer" } satisfies LayerRule,
  precomposable: { kinds: ["footage", "still", "text", "shape", "solid", "adjustment", "audio", "null"], noun: "layer" } satisfies LayerRule,
  precomp: { kinds: ["precomp"], noun: "precomp layer" } satisfies LayerRule,
  text: { kinds: ["text"], noun: "text layer" } satisfies LayerRule,
  audio: { where: (l: LayerInfo) => l.hasAudio, noun: "audio layer" } satisfies LayerRule,
  visual: { kinds: VISUAL_KINDS, noun: "visual layer" } satisfies LayerRule,
};
