import { describe, expect, it } from "vitest";
import { parse } from "acorn";
import { bundleHost } from "../../scripts/build-host.mjs";
import { AVLayer, CompItem, Effect, Property, TextLayer, createHost } from "./aeMock";

const fps = 30;
const f = (n: number) => n / fps;

describe("host bundle", () => {
  it("parses as ES3 so ExtendScript can run it", () => {
    expect(() => parse(bundleHost(), { ecmaVersion: 3, allowReserved: false })).not.toThrow();
  });

  it("rejects ES3 reserved words such as short as identifiers", () => {
    expect(() => parse("var short = 1;", { ecmaVersion: 3, allowReserved: false })).toThrow(/reserved/);
  });

  it("answers ping with the registered actions", () => {
    const h = createHost();
    const r = h.call("host.ping");
    expect(r.ok).toBe(true);
    expect(r.result.actions).toContain("arrange.moveToPlayhead");
    expect(r.result.actions).toContain("fx.setEnabled");
  });

  it("rejects unknown actions without throwing", () => {
    const h = createHost();
    const r = h.call("nope.nothing");
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("unknown_action");
  });

  it("round-trips unicode names through its JSON layer", () => {
    const h = createHost();
    const c = h.comp("Café ✂ 編集");
    const r = h.call("state.get");
    expect(r.result.comp.name).toBe(c.name);
  });
});

describe("undo and failure handling", () => {
  it("wraps project changes in exactly one named undo group", () => {
    const h = createHost();
    const c = h.comp();
    const a = c.addLayer(new AVLayer("A"), 1, 2);
    c.select(a);
    const r = h.call("arrange.moveToPlayhead");
    expect(r.ok).toBe(true);
    expect(r.undo).toBe("Move to Playhead");
    expect(h.undoLog).toEqual(["Move to Playhead"]);
    expect(h.openGroups).toBe(0);
  });

  it("opens no undo group for read-only actions", () => {
    const h = createHost();
    h.comp();
    h.call("state.get");
    h.call("fx.list", { scope: "comp" });
    expect(h.undoLog).toEqual([]);
  });

  it("closes the undo group and explains itself when there is no comp", () => {
    const h = createHost();
    const r = h.call("arrange.moveToPlayhead");
    expect(r.ok).toBe(false);
    expect(r.error?.message).toBe("Open a composition first.");
    expect(h.openGroups).toBe(0);
  });

  it("removes layers created before a failure", () => {
    const h = createHost();
    const c = h.comp("Main");
    const inner = h.project.addItem(new CompItem("Inner"));
    inner.addLayer(new AVLayer("bottom"), 0, 5);
    inner.addLayer(new AVLayer("top"), 0, 5);
    const pl = c.addLayer(new AVLayer("Precomp"), 0, 5, { source: inner });
    // Layers are copied bottom-up: the first copy succeeds, the second blows up.
    (inner.layer(2) as any).copyToComp = (target: CompItem) => target.addLayer(new AVLayer("copy"), 0, 5);
    (inner.layer(1) as any).copyToComp = () => {
      throw new Error("disk full");
    };
    c.select(pl);
    const before = c.numLayers;
    const r = h.call("arrange.unprecompose");
    expect(r.error?.rolledBack).toBe(1);
    expect(r.ok).toBe(false);
    expect(r.error?.step).toBe("Un-precompose Precomp");
    expect(r.error?.message).toContain("disk full");
    expect(c.numLayers).toBe(before);
    expect(h.openGroups).toBe(0);
  });
});

describe("state.get", () => {
  it("reports comp and selection with layer kinds", () => {
    const h = createHost();
    const c = h.comp();
    const clip = c.addLayer(new AVLayer("clip"), 0, 2, { source: h.footage("clip.mp4") });
    const still = c.addLayer(new AVLayer("photo"), 0, 2, { source: h.footage("photo.png", { still: true }) });
    const music = c.addLayer(new AVLayer("music"), 0, 2, {
      source: h.footage("song.wav", { audioOnly: true }),
      hasVideo: false,
      hasAudio: true,
    });
    const text = c.addLayer(new TextLayer("Title"), 0, 2);
    c.select(clip, still, music, text);
    const s = h.call("state.get").result;
    expect(s.comp.name).toBe("Main");
    expect(s.selection.map((l: any) => l.kind)).toEqual(["footage", "still", "audio", "text"]);
  });

  it("returns a null comp when none is active", () => {
    const h = createHost();
    expect(h.call("state.get").result.comp).toBeNull();
  });
});

describe("arrange", () => {
  it("moves layers so the earliest starts at the playhead, keeping offsets", () => {
    const h = createHost();
    const c = h.comp();
    const a = c.addLayer(new AVLayer("A"), f(30), f(60));
    const b = c.addLayer(new AVLayer("B"), f(45), f(90));
    c.time = f(120);
    c.select(b, a);
    h.call("arrange.moveToPlayhead");
    expect(a.inPoint).toBeCloseTo(f(120));
    expect(b.inPoint).toBeCloseTo(f(135));
  });

  it("skips locked layers with a warning", () => {
    const h = createHost();
    const c = h.comp();
    const a = c.addLayer(new AVLayer("A"), 1, 2);
    const b = c.addLayer(new AVLayer("B"), 1, 2, { locked: true });
    c.time = 3;
    c.select(a, b);
    const r = h.call("arrange.moveToPlayhead");
    expect(a.inPoint).toBe(3);
    expect(b.inPoint).toBe(1);
    expect(r.warnings).toEqual(["B: locked, skipped."]);
  });

  it("staircases in selection order with overlap", () => {
    const h = createHost();
    const c = h.comp();
    const a = c.addLayer(new AVLayer("A"), 0, f(30));
    const b = c.addLayer(new AVLayer("B"), 0, f(20));
    const d = c.addLayer(new AVLayer("D"), f(100), f(110));
    c.select(a, d, b);
    h.call("arrange.staircase", { overlapFrames: 5 });
    expect(a.inPoint).toBeCloseTo(0);
    expect(d.inPoint).toBeCloseTo(f(25));
    expect(d.outPoint).toBeCloseTo(f(35));
    expect(b.inPoint).toBeCloseTo(f(30));
  });

  it("requires two layers to staircase", () => {
    const h = createHost();
    const c = h.comp();
    c.select(c.addLayer(new AVLayer("A"), 0, 1));
    const r = h.call("arrange.staircase");
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("selection");
  });

  it("duplicates a comp and every nested precomp, sharing none", () => {
    const h = createHost();
    const main = h.comp("Main");
    const nested = h.project.addItem(new CompItem("Nested"));
    const shared = h.project.addItem(new CompItem("Shared"));
    nested.addLayer(new AVLayer("shared in nested"), 0, 1, { source: shared });
    main.addLayer(new AVLayer("nested"), 0, 1, { source: nested });
    main.addLayer(new AVLayer("shared"), 0, 1, { source: shared });
    const dupOf = (comp: CompItem) => {
      const copy = h.project.addItem(new CompItem(comp.name, comp.width, comp.height, comp.duration));
      [...comp.layerList].reverse().forEach((l) => copy.addLayer(new AVLayer(l.name), l.inPoint, l.outPoint, { source: l.source }));
      return copy;
    };
    for (const comp of [main, nested, shared]) {
      (comp as any).duplicate = () => {
        const copy = dupOf(comp);
        (copy as any).openInViewer = () => {};
        return copy;
      };
    }
    for (const comp of h.project.all) {
      for (const l of (comp as CompItem).layerList ?? []) {
        (l as any).replaceSource = (src: CompItem) => (l.source = src);
      }
    }
    // Copies need replaceSource too; patch AVLayer prototype for the test.
    (AVLayer.prototype as any).replaceSource = function (src: CompItem) {
      this.source = src;
    };
    const r = h.call("arrange.duplicateComp", { open: false });
    expect(r.ok).toBe(true);
    expect(r.result.duplicated).toBe(3);
    const dup = h.project.all.find((i) => i.name === "Main (independent)") as CompItem;
    const originals = new Set([main, nested, shared]);
    const walk = (comp: CompItem): CompItem[] =>
      comp.layerList.flatMap((l) => (l.source instanceof CompItem ? [l.source, ...walk(l.source)] : []));
    const used = walk(dup);
    expect(used.length).toBe(3);
    used.forEach((cmp) => expect(originals.has(cmp)).toBe(false));
    // The shared precomp maps to a single duplicate inside the new tree.
    const sharedCopies = new Set(used.filter((cmp) => cmp.name === "Shared copy"));
    expect(sharedCopies.size).toBe(1);
    delete (AVLayer.prototype as any).replaceSource;
  });
});

describe("audio", () => {
  function audioLayer(c: CompItem, name = "music") {
    return c.addLayer(new AVLayer(name), 0, 4, { hasAudio: true, hasVideo: false });
  }
  const levels = (l: AVLayer) => (l.property("ADBE Audio Group") as any).property("ADBE Audio Levels") as Property;

  it("shifts all 10 level keyframes by exactly 3 dB", () => {
    const h = createHost();
    const c = h.comp();
    const l = audioLayer(c);
    const p = levels(l)!;
    for (let i = 0; i < 10; i++) p.setValueAtTime(i * 0.3, [-i, -i * 2]);
    c.select(l);
    const r = h.call("audio.volume", { db: 3 });
    expect(r.result.keys).toBe(10);
    p.keys.forEach((k, i) => expect(k.value).toEqual([-i + 3, -i * 2 + 3]));
    expect(r.undo).toBe("Volume Up");
  });

  it("shifts a static level", () => {
    const h = createHost();
    const c = h.comp();
    const l = audioLayer(c);
    c.select(l);
    h.call("audio.volume", { db: -3 });
    expect(levels(l)!.value).toEqual([-3, -3]);
  });

  it("adds fade in and out keys at the layer edges", () => {
    const h = createHost();
    const c = h.comp();
    const l = audioLayer(c);
    c.select(l);
    h.call("audio.fade", { mode: "both", seconds: 1, floorDb: -48 });
    const keys = levels(l)!.keys.map((k) => [k.time, k.value]);
    expect(keys).toEqual([
      [0, [-48, -48]],
      [1, [0, 0]],
      [3, [0, 0]],
      [4, [-48, -48]],
    ]);
  });

  it("clamps fades to half the layer when fading both ends", () => {
    const h = createHost();
    const c = h.comp();
    const l = audioLayer(c);
    c.select(l);
    h.call("audio.fade", { mode: "both", seconds: 10 });
    expect(levels(l)!.keys.map((k) => k.time)).toEqual([0, 2, 4]);
  });

  it("explains when no selected layer has audio", () => {
    const h = createHost();
    const c = h.comp();
    c.select(c.addLayer(new AVLayer("video"), 0, 1));
    const r = h.call("audio.volume", { db: 3 });
    expect(r.ok).toBe(false);
    expect(r.error?.message).toBe("Select at least one layer with audio.");
  });
});

describe("fx manager", () => {
  function setup() {
    const h = createHost();
    const c = h.comp();
    const a = c.addLayer(new AVLayer("A"), 0, 1);
    const b = c.addLayer(new AVLayer("B"), 0, 1);
    const fxA = a.property("ADBE Effect Parade") as any;
    const fxB = b.property("ADBE Effect Parade") as any;
    const blurA = fxA.addProperty("ADBE Gaussian Blur 2") as Effect;
    const blurB = fxB.addProperty("ADBE Gaussian Blur 2") as Effect;
    blurB.name = "Gaussian Blur 2";
    const exp = fxB.addProperty("ADBE Exposure2") as Effect;
    return { h, c, a, b, blurA, blurB, exp };
  }

  it("groups effects by type with counts and states", () => {
    const { h, blurB } = setup();
    blurB.enabled = false;
    const r = h.call("fx.list", { scope: "comp" }).result;
    expect(r.total).toBe(3);
    expect(r.groups.map((g: any) => [g.name, g.count, g.state])).toEqual([
      ["Exposure", 1, "on"],
      ["Gaussian Blur", 2, "mixed"],
    ]);
  });

  it("limits the list to selected layers", () => {
    const { h, c, a } = setup();
    c.select(a);
    const r = h.call("fx.list", { scope: "selected" }).result;
    expect(r.total).toBe(1);
  });

  it("toggling a group off and on restores each instance's previous state", () => {
    const { h, blurA, blurB } = setup();
    blurB.enabled = false;
    const off = h.call("fx.setEnabled", { scope: "comp", matchName: "ADBE Gaussian Blur 2", enabled: false });
    expect(off.result.changed.length).toBe(1);
    expect(blurA.enabled).toBe(false);
    h.call("fx.setEnabled", { scope: "comp", matchName: "ADBE Gaussian Blur 2", enabled: true, restore: off.result.changed });
    expect(blurA.enabled).toBe(true);
    expect(blurB.enabled).toBe(false);
  });

  it("master toggle switches everything", () => {
    const { h, blurA, blurB, exp } = setup();
    h.call("fx.setEnabled", { scope: "comp", matchName: null, enabled: false });
    expect([blurA.enabled, blurB.enabled, exp.enabled]).toEqual([false, false, false]);
  });
});

describe("project", () => {
  it("tidies root items into type folders without renaming", () => {
    const h = createHost();
    const main = h.comp("Main");
    const pre = h.project.addItem(new CompItem("Pre"));
    main.addLayer(new AVLayer("pre"), 0, 1, { source: pre });
    h.footage("clip.mp4");
    h.footage("song.wav", { audioOnly: true });
    h.footage("photo.png", { still: true });
    h.footage("White Solid", { solid: true });
    const r = h.call("project.tidyBin");
    expect(r.result.counts).toEqual({ Comps: 1, Precomps: 1, Footage: 1, Audio: 1, Images: 1, Solids: 1 });
    const folderOf = (name: string) => h.project.all.find((i) => i.name === name)!.parentFolder!.name;
    expect(folderOf("Main")).toBe("Comps");
    expect(folderOf("Pre")).toBe("Precomps");
    expect(folderOf("White Solid")).toBe("Solids");
    expect(folderOf("photo.png")).toBe("Images");
    // Running again moves nothing and creates no duplicate folders.
    expect(h.call("project.tidyBin").result.moved).toBe(0);
    expect(h.project.all.filter((i) => i.name === "Comps").length).toBe(1);
  });

  it("reframes 16:9 to 9:16 and re-centres unparented layers, keyframes included", () => {
    const h = createHost();
    const c = h.comp("Main", 1920, 1080);
    const a = c.addLayer(new AVLayer("A"), 0, 1);
    const b = c.addLayer(new AVLayer("B"), 0, 1);
    const pos = b.property("ADBE Transform Group") as any;
    (pos.property("ADBE Position") as Property).setValueAtTime(0, [0, 0]);
    (pos.property("ADBE Position") as Property).setValueAtTime(1, [100, 100]);
    const child = c.addLayer(new AVLayer("child"), 0, 1, { parent: a });
    const r = h.call("project.reframeComp", { width: 1080, height: 1920 });
    expect(r.ok).toBe(true);
    expect([c.width, c.height]).toEqual([1080, 1920]);
    const posOf = (l: AVLayer) => ((l.property("ADBE Transform Group") as any).property("ADBE Position") as Property);
    expect(posOf(a).value).toEqual([540, 960]);
    expect(posOf(b).keys.map((k) => k.value)).toEqual([[-420, 420], [-320, 520]]);
    expect(posOf(child).value).toEqual([960, 540]);
  });

  it("rejects impossible comp sizes", () => {
    const h = createHost();
    h.comp();
    expect(h.call("project.reframeComp", { width: 2, height: 1080 }).ok).toBe(false);
  });

  it("purges caches without an undo group", () => {
    const h = createHost();
    h.call("project.purge");
    expect(h.app.purged).toBe(true);
    expect(h.undoLog).toEqual([]);
  });
});

describe("un-precompose", () => {
  it("moves inner layers above the precomp layer with offset timing, keeping order and locks", () => {
    const h = createHost();
    const c = h.comp("Main");
    const inner = h.project.addItem(new CompItem("Inner"));
    inner.addLayer(new AVLayer("bottom"), 0, 4);
    inner.addLayer(new AVLayer("top"), 1, 3, { locked: true });
    const below = c.addLayer(new AVLayer("below"), 0, 10);
    const pl = c.addLayer(new AVLayer("Precomp"), 2, 4, { source: inner });
    pl._start = 2; // precomp starts at 2 s, trimmed to [2, 4]
    (AVLayer.prototype as any).copyToComp = function (this: AVLayer, target: CompItem) {
      target.addLayer(new AVLayer(this.name), this.inPoint, this.outPoint, { locked: this.locked });
    };
    (AVLayer.prototype as any).moveBefore = function (this: AVLayer, other: AVLayer) {
      const list = this.comp.layerList;
      list.splice(list.indexOf(this), 1);
      list.splice(list.indexOf(other), 0, this);
    };
    c.select(pl);
    const r = h.call("arrange.unprecompose");
    delete (AVLayer.prototype as any).copyToComp;
    delete (AVLayer.prototype as any).moveBefore;
    expect(r.ok).toBe(true);
    expect(c.layerList.map((l) => l.name)).toEqual(["top", "bottom", "Precomp", "below"]);
    const [top, bottom] = c.layerList;
    expect([top.inPoint, top.outPoint]).toEqual([3, 4]); // 1..3 shifted by 2, trimmed to 4
    expect([bottom.inPoint, bottom.outPoint]).toEqual([2, 4]);
    expect(top.locked).toBe(true);
    expect(pl.enabled).toBe(false);
    expect(c.layerList).toContain(below);
    expect(r.warnings).toContain("Precomp: original precomp layer switched off, not deleted.");
  });
});
