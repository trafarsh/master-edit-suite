import { describe, expect, it } from "vitest";
import type { HostState, LayerInfo } from "../../src/panel/bridge/types";
import { needsComp, needsLayers, needsSceneClip, rules } from "../../src/panel/core/requirements";

function layer(kind: LayerInfo["kind"], extra: Partial<LayerInfo> = {}): LayerInfo {
  return {
    index: 1, id: 1, name: kind, kind, inPoint: 0, outPoint: 1, startTime: 0, stretch: 100, locked: false, enabled: true,
    hasVideo: kind !== "audio", hasAudio: kind === "audio", timeRemap: false, threeD: false, sourceId: null, numEffects: 0,
    parentIndex: null, comment: "", ...extra,
  };
}

function state(selection: LayerInfo[], comp = true): HostState {
  return {
    project: { name: "p.aep", saved: true, numItems: 1 },
    comp: comp
      ? { id: 1, name: "Main", width: 1920, height: 1080, pixelAspect: 1, frameRate: 30, frameDuration: 1 / 30, duration: 10, time: 0, displayStartTime: 0, numLayers: 3 }
      : null,
    selection,
    keys: { properties: 0, pairs: 0 },
  };
}

describe("selection awareness", () => {
  it("disables comp actions with a reason when no comp is open", () => {
    const a = needsLayers(state([], false), rules.anyLayer);
    expect(a.enabled).toBe(false);
    expect(a.reason).toBe("Open a composition first");
    expect(needsComp(state([], false)).enabled).toBe(false);
  });

  it("states its target when enabled", () => {
    const a = needsLayers(state([layer("footage"), layer("text"), layer("solid")]), rules.anyLayer);
    expect(a).toMatchObject({ enabled: true, target: "3 layers" });
  });

  it("explains a missing selection with the right noun", () => {
    expect(needsLayers(state([layer("footage")]), rules.text).reason).toBe("Select at least one text layer");
    expect(needsLayers(state([layer("footage")]), rules.twoLayers).reason).toBe("Select at least 2 layers");
  });

  it("counts only matching, unlocked layers and says why", () => {
    const a = needsLayers(state([layer("audio", { locked: true }), layer("footage")]), rules.audio);
    expect(a.enabled).toBe(false);
    expect(a.reason).toContain("locked layers don't count");
    const b = needsLayers(state([layer("audio"), layer("footage", { hasAudio: true }), layer("text")]), rules.audio);
    expect(b.target).toBe("2 audio layers");
  });

  it("is disabled while the host has not answered yet", () => {
    expect(needsLayers(null).enabled).toBe(false);
  });

  it("cuts need exactly one footage clip without time remapping", () => {
    expect(needsSceneClip(state([layer("footage"), layer("footage")])).reason).toBe("Select only one footage clip");
    expect(needsSceneClip(state([layer("footage", { timeRemap: true })])).reason).toContain("time remapping");
    expect(needsSceneClip(state([layer("footage", { name: "a.mp4" })]))).toMatchObject({ enabled: true, target: "a.mp4" });
  });
});
