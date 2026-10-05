import { describe, expect, it } from "vitest";
import { BUNDLED_STYLES, buildRunArgs, bundledCatalog, effectiveStyle, validateCatalog, type Style } from "../../src/panel/core/autoedit";
import { AVLayer, CompItem, Effect, Property, createHost, type Layer } from "./aeMock";

const catalog = bundledCatalog();
const hard = BUNDLED_STYLES.find((s) => s.id === "hard-filmstyle")!;
const balance = { target: 5, strength: 0.8, tameBright: false };
const fd = 1 / 30;

/** Intro (0..2 s) then `n` one-second clips from 2 s, plus music. */
function setup(n = 3, opts: { intro?: boolean; clipFrames?: number[] } = {}) {
  const h = createHost();
  const c = h.comp("Edit", 1080, 1920, 20);
  c.addLayer(new AVLayer("music"), 0, 20, { hasVideo: false, hasAudio: true, source: h.footage("song.wav", { audioOnly: true }) });
  if (opts.intro !== false) c.addLayer(new AVLayer("intro"), 0, 2, { source: h.footage("intro.mp4") });
  let t = 2;
  const clips: Layer[] = [];
  for (let i = 0; i < n; i++) {
    const len = (opts.clipFrames?.[i] ?? 30) * fd;
    clips.push(c.addLayer(new AVLayer(`clip ${i + 1}`), t, t + len, { source: h.footage(`clip${i + 1}.mp4`) }));
    t += len;
  }
  c.select(...clips.slice().reverse());
  return { h, c, clips };
}

function run(h: ReturnType<typeof createHost>, style: Style = hard, ids?: number[], overwriteTimeRemap = false) {
  return h.call("autoedit.run", buildRunArgs(style, catalog, ids ?? [], { balance, overwriteTimeRemap }));
}

const fxNames = (l: Layer) => ((l.property("ADBE Effect Parade") as any).props as Effect[]).map((e) => e.name);

describe("auto edit styles", () => {
  it("bundled styles, effects and looks are valid and reference known recipes", () => {
    expect(validateCatalog(catalog)).toEqual([]);
    expect(BUNDLED_STYLES.map((s) => s.name).sort()).toEqual(["Clean Punch", "Glitch Rush", "Hard Filmstyle"]);
  });

  it("applies per-run overrides, including another style for the effects step only", () => {
    const clean = BUNDLED_STYLES.find((s) => s.id === "clean-punch")!;
    const s = effectiveStyle(hard, { cutsType: "glitch", shake: false, effectsStyleId: "clean-punch", steps: { extra: false } }, catalog);
    expect(s.cuts.type).toBe("glitch");
    expect(s.shake.enabled).toBe(false);
    expect(s.zoom.amount).toBe(clean.zoom.amount);
    expect(s.cc.look).toBe("hard-film");
    expect(s.steps.extra).toBe(false);
  });
});

describe("autoedit.inspect", () => {
  it("describes the edit part", () => {
    const { h, clips } = setup(3, { clipFrames: [30, 4, 30] });
    const r = h.call("autoedit.inspect", {});
    expect(r.result).toMatchObject({
      clips: 3,
      start: 2,
      needPrecompose: 3,
      shortClips: ["clip 2"],
      hasIntro: true,
    });
    expect(r.result.ids).toEqual(clips.map((c) => c.id));
    expect(r.result.switches.map((t: number) => Math.round(t * 30))).toEqual([90, 94]);
  });

  it("sees no intro when the edit part starts the comp", () => {
    const { h } = setup(2, { intro: false });
    expect(h.call("autoedit.inspect", {}).result.hasIntro).toBe(false);
  });
});

describe("autoedit.run", () => {
  it("runs all six steps in one undo group and keeps cut timing", () => {
    const { h, c, clips } = setup(3);
    const before = clips.map((l) => [l.inPoint, l.outPoint]);
    const r = run(h);
    expect(r.ok).toBe(true);
    expect(h.undoLog).toEqual(["Auto Edit"]);
    expect(r.result).toMatchObject({ clips: 3, precomposed: 3, velocity: 3, zoom: 3, shake: 3, transitionIn: true, cuts: 2, extra: true, cc: true });

    const precomps = c.layerList.filter((l) => l.source instanceof CompItem);
    expect(precomps).toHaveLength(3);
    const sorted = precomps.sort((a, b) => a.inPoint - b.inPoint);
    expect(sorted.map((l) => [l.inPoint, l.outPoint])).toEqual(before);

    const clip = sorted[0];
    expect(fxNames(clip)).toEqual(["MES Velocity", "MES Motion Tile", "MES Motion"]);
    expect(clip.timeRemapEnabled).toBe(true);
    expect((clip.property("ADBE Time Remapping") as Property).expression).toContain('effect("MES Velocity")(1)');
    expect(clip.comment).toMatch(/autoedit:[a-z0-9]+:clip/);
    expect(c.frameBlending).toBe(true);
  });

  it("stacks generated layers above the topmost clip: CC, additional, transitions, flash", () => {
    const { h, c } = setup(3);
    run(h);
    const names = c.layerList.map((l) => l.name);
    const topClip = names.findIndex((n) => n.startsWith("clip"));
    const above = names.slice(0, topClip);
    // Bottom to top, so read the list backwards.
    const tiers = above.reverse().map((n) => n.split(" · ")[0]);
    const order = tiers.filter((t, i) => t !== tiers[i - 1]);
    expect(order).toEqual(["AE CC", "AE FX", "AE TR", "AE FL"]);
    // Zoom into edit has no flash layer; each of the 2 clip switches gets one.
    expect(above.filter((n) => n.startsWith("AE FL"))).toHaveLength(2);
  });

  it("re-running on the same clips leaves one set of generated layers", () => {
    const { h, c } = setup(3);
    run(h);
    const first = c.layerList.map((l) => l.name);
    const ids = c.layerList.filter((l) => l.comment.includes(":clip")).map((l) => l.id);
    const r = run(h, hard, ids);
    expect(r.ok).toBe(true);
    expect(r.result.removed).toBeGreaterThan(0);
    expect(c.layerList.map((l) => l.name)).toEqual(first);
    const clip = c.layerList.find((l) => l.comment.includes(":clip"))!;
    expect(fxNames(clip)).toEqual(["MES Velocity", "MES Motion Tile", "MES Motion"]);
  });

  it("adds nothing for a switched-off step", () => {
    const { h, c } = setup(3);
    const count = c.numLayers;
    const off = { ...hard, steps: { precompose: false, effects: false, transitionIn: false, cuts: false, extra: false, cc: false } };
    const r = run(h, off);
    expect(r.ok).toBe(true);
    expect(c.numLayers).toBe(count);
    expect(c.layerList.every((l) => fxNames(l).length === 0)).toBe(true);
  });

  it("skips clip switches with one clip and the intro transition without an intro, with notices", () => {
    const { h } = setup(1, { intro: false });
    const r = run(h);
    expect(r.ok).toBe(true);
    expect(r.result.cuts).toBe(0);
    expect(r.result.transitionIn).toBe(false);
    expect(r.warnings).toContain("Only one clip, so there are no clip switches to transition.");
    expect(r.warnings).toContain("No intro before the edit part, so no transition into it.");
  });

  it("gives short clips no velocity or zooms, and keeps existing time remapping unless confirmed", () => {
    const { h, c, clips } = setup(3, { clipFrames: [30, 4, 30] });
    clips[2].timeRemapEnabled = true;
    const off = { ...hard, steps: { ...hard.steps, precompose: false } };
    const r = run(h, off);
    expect(r.result.velocity).toBe(1);
    expect(r.result.zoom).toBe(2);
    expect(r.warnings).toContain("clip 2: shorter than 6 frames, no velocity.");
    expect(r.warnings!.some((w: string) => w.startsWith("clip 3: already time-remapped"))).toBe(true);
    const r2 = run(h, off, c.layerList.filter((l) => l.comment.includes(":clip")).map((l) => l.id), true);
    expect(r2.result.velocity).toBe(2);
  });

  it("skips locked clips and leaves no half-built output when a step fails", () => {
    const { h, c, clips } = setup(3);
    clips[1].locked = true;
    const broken = structuredClone(catalog.transitions.find((t) => t.id === "flash")!);
    broken.layers.push({ type: "adjustment", name: "Broken", effects: [{ matchName: "MISSING effect", params: {} }] });
    const args = buildRunArgs({ ...hard, steps: { ...hard.steps, precompose: false } }, catalog, [], { balance });
    args.cuts!.recipe = broken;
    const before = c.numLayers;
    const r = h.call("autoedit.run", args);
    expect(r.ok).toBe(false);
    expect(r.error?.step).toBe("Transition at switch 1 › Flash · Broken");
    expect(c.numLayers).toBe(before);
    expect(clips.every((l) => fxNames(l).length === 0)).toBe(true);
    expect(clips[0].timeRemapEnabled).toBe(false);
    expect(h.openGroups).toBe(0);
  });
});
