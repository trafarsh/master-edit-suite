import { describe, expect, it } from "vitest";
import { AVLayer, createHost } from "./aeMock";

function setup(times: number[], opts: Partial<AVLayer> = {}) {
  const h = createHost();
  const c = h.comp();
  const clip = c.addLayer(new AVLayer("clip"), 1, 7, { source: h.footage("clip.mp4"), ...opts });
  const modes: number[] = [];
  (clip as any).doSceneEditDetection = (mode: number) => {
    modes.push(mode);
    return times;
  };
  c.select(clip);
  return { h, c, clip, modes };
}

describe("cuts", () => {
  it("returns frame-snapped cut times inside the clip only", () => {
    const { h } = setup([0.5, 2.0001, 2.01, 4.5, 7, 9]);
    const r = h.call("cuts.detect");
    expect(r.ok).toBe(true);
    expect(r.result.times).toEqual([2, 4.5]);
  });

  it("adds one adjustment layer per shot directly above the clip", () => {
    const { h, c, clip } = setup([3, 5]);
    const r = h.call("cuts.adjustmentPerCut");
    expect(r.result).toEqual({ shots: 3, cuts: 2 });
    const shots = c.layerList.filter((l) => l.adjustmentLayer).sort((a, b) => a.inPoint - b.inPoint);
    expect(shots.map((l) => [l.inPoint, l.outPoint])).toEqual([
      [1, 3],
      [3, 5],
      [5, 7],
    ]);
    // All directly above the clip.
    expect(c.layerList.indexOf(clip)).toBe(3);
  });

  it("refuses time-remapped layers with a reason", () => {
    const { h, modes } = setup([2], { timeRemapEnabled: true });
    const r = h.call("cuts.detect");
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("time_remap");
    expect(modes).toEqual([]);
  });

  it("needs exactly one footage clip", () => {
    const { h, c, clip } = setup([2]);
    c.select(clip, c.addLayer(new AVLayer("other"), 0, 1, { source: h.footage("b.mp4") }));
    expect(h.call("cuts.split").error?.message).toBe("Select exactly one footage clip.");
  });
});
