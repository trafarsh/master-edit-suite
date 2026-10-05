import { describe, expect, it } from "vitest";
import { AVLayer, Effect, Property, createHost, fsName_missing } from "./aeMock";

describe("library host actions", () => {
  it("drops a sound effect exactly at the playhead frame, above the selected layer", () => {
    const h = createHost();
    const c = h.comp();
    const clip = c.addLayer(new AVLayer("clip"), 0, 5);
    c.addLayer(new AVLayer("title"), 0, 5);
    c.time = 37 / 30;
    c.select(clip);
    const r = h.call("library.insertSound", { file: "D:/lib/sounds/Whooshes/whoosh 1.wav" });
    expect(r.ok).toBe(true);
    expect(r.undo).toBe("Insert Sound Effect");
    const sfx = c.layerList.find((l) => l.name === "whoosh 1.wav")!;
    expect(sfx.startTime).toBeCloseTo(37 / 30, 10);
    expect(c.layerList.indexOf(sfx)).toBe(c.layerList.indexOf(clip) - 1);
    expect(h.project.all.find((i) => i.name === "whoosh 1.wav")!.parentFolder!.name).toBe("Library");
  });

  it("reuses an already imported file", () => {
    const h = createHost();
    h.comp();
    h.call("library.insertSound", { file: "D:/lib/a.wav" });
    h.call("library.insertSound", { file: "D:/lib/a.wav" });
    expect(h.project.imports).toBe(1);
  });

  it("explains a missing file instead of importing", () => {
    const h = createHost();
    h.comp();
    fsName_missing.add("D:/lib/gone.wav");
    const r = h.call("library.insertSound", { file: "D:/lib/gone.wav" });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("missing_file");
  });

  it("inserts a texture filling the comp with the chosen blend mode", () => {
    const h = createHost();
    const c = h.comp("Main", 1080, 1920);
    const r = h.call("library.insertTexture", { file: "D:/lib/textures/Dust/dust.png", blendMode: "SCREEN" });
    expect(r.ok).toBe(true);
    const tex = c.layerList[0];
    const scale = (tex.property("ADBE Transform Group") as any).property("ADBE Scale").value;
    expect(scale[0]).toBeCloseTo(384); // 1920 / 500 px tall source
    expect(tex.blendingMode).toBe(2);
  });

  it("applies a preset to 5 selected layers with one call and one undo step", () => {
    const h = createHost();
    const c = h.comp();
    const layers = Array.from({ length: 5 }, (_, i) => c.addLayer(new AVLayer(`L${i}`), i, i + 2));
    c.select(...layers);
    let calls = 0;
    (AVLayer.prototype as any).applyPreset = () => calls++;
    const r = h.call("library.applyPreset", { file: "D:/lib/presets/Zooms/zoom.ffx" });
    delete (AVLayer.prototype as any).applyPreset;
    expect(r.ok).toBe(true);
    expect(calls).toBe(1);
    expect(h.undoLog).toEqual(["Apply Preset"]);
  });

  it("applies at each layer's start and stretches only the preset's keys to the layer", () => {
    const h = createHost();
    const c = h.comp();
    const a = c.addLayer(new AVLayer("A"), 2, 6);
    const b = c.addLayer(new AVLayer("B"), 1, 3);
    // An existing key the preset must not move.
    const opacity = (a.property("ADBE Transform Group") as any).property("ADBE Opacity") as Property;
    opacity.setValueAtTime(5, 50);
    c.time = 0.5;
    c.select(a, b);
    // The preset adds a Gaussian Blur animated from the playhead to playhead + 1 s.
    (AVLayer.prototype as any).applyPreset = function (this: AVLayer) {
      const fx = (this.property("ADBE Effect Parade") as any).addProperty("ADBE Gaussian Blur 2") as Effect;
      const blur = fx.property(1) as Property; // Blurriness
      blur.setValueAtTime(this.comp.time, 40);
      blur.setValueAtTime(this.comp.time + 1, 0);
    };
    const r = h.call("library.applyPreset", { file: "D:/x.ffx", atLayerStart: true, stretch: true });
    delete (AVLayer.prototype as any).applyPreset;
    expect(r.ok).toBe(true);
    const blurKeys = (l: AVLayer) => ((l.property("ADBE Effect Parade") as any).property(1).property(1) as Property).keys.map((k) => k.time);
    expect(blurKeys(a).map((t) => +t.toFixed(4))).toEqual([2, +(6 - 1 / 30).toFixed(4)]);
    expect(blurKeys(b).map((t) => +t.toFixed(4))).toEqual([1, +(3 - 1 / 30).toFixed(4)]);
    expect(opacity.keys.map((k) => k.time)).toEqual([5]);
    // Playhead and selection are restored.
    expect(c.time).toBe(0.5);
    expect(c.selectedLayers.map((l) => l.name).sort()).toEqual(["A", "B"]);
  });

  it("finds installed effects by name", () => {
    const h = createHost();
    expect(h.call("host.findEffects", { pattern: "twixtor" }).result.matchNames).toEqual([]);
    expect(h.call("host.findEffects", { pattern: "blur" }).result.matchNames).toEqual(["ADBE Gaussian Blur 2"]);
  });
});
