import { afterEach, describe, expect, it } from "vitest";
import { AVLayer, Effect, Property, createHost, type Layer } from "./aeMock";

// The mock cannot render, so sampleImage expressions read a per-layer test luma.
const lumaOf = new Map<Layer, number>();
const realValueAtTime = Property.prototype.valueAtTime;
Property.prototype.valueAtTime = function (this: Property, t: number) {
  if (this.expression.includes("sampleImage")) {
    const layer = (this.parentGroup as Effect).parentGroup!.owner!;
    const l = lumaOf.get(layer) ?? 0.5;
    return [l, l, l, 1];
  }
  return realValueAtTime.call(this, t);
};
afterEach(() => lumaOf.clear());

function setup(lumas: number[]) {
  const h = createHost();
  const c = h.comp();
  const clips = lumas.map((l, i) => {
    const clip = c.addLayer(new AVLayer(`clip ${i + 1}`), i, i + 1, { source: h.footage(`c${i}.mp4`) });
    lumaOf.set(clip, l);
    return clip;
  });
  c.select(...clips);
  return { h, c, clips };
}

const exposure = (l: Layer) => {
  const parade = l.property("ADBE Effect Parade") as any;
  const fx = parade.props.find((p: Effect) => p.name === "MES Balance") as Effect | undefined;
  return fx ? (fx.property(3) as Property).value : null;
};

describe("balance brightness", () => {
  it("brightens dark clips toward the target and leaves no probe effects behind", () => {
    const { h, clips } = setup([0.175, 0.35]);
    const r = h.call("color.balance", { target: 5, strength: 1, tameBright: false });
    expect(r.ok).toBe(true);
    expect(r.result.clips).toBe(2);
    expect(exposure(clips[0])).toBeCloseTo(2.2, 2); // one stop of display luma = 2.2 linear stops
    expect(exposure(clips[1])).toBe(0);
    for (const c of clips) expect((c.property("ADBE Effect Parade") as any).numProperties).toBe(1);
  });

  it("only darkens over-bright clips when asked to", () => {
    const { h, clips } = setup([0.7]);
    h.call("color.balance", { target: 5, strength: 1, tameBright: false });
    expect(exposure(clips[0])).toBe(0);
    h.call("color.balance", { target: 5, strength: 1, tameBright: true });
    expect(exposure(clips[0])).toBeCloseTo(-2.2, 2);
  });

  it("gives the same result when run twice", () => {
    const { h, clips } = setup([0.2, 0.5]);
    h.call("color.balance", { target: 6, strength: 0.8, tameBright: true });
    const once = clips.map(exposure);
    h.call("color.balance", { target: 6, strength: 0.8, tameBright: true });
    expect(clips.map(exposure)).toEqual(once);
    for (const c of clips) expect((c.property("ADBE Effect Parade") as any).numProperties).toBe(1);
  });

  it("puts the balance effect first so it acts on the source", () => {
    const { h, clips } = setup([0.2]);
    (clips[0].property("ADBE Effect Parade") as any).addProperty("ADBE Gaussian Blur 2");
    h.call("color.balance", { target: 5 });
    expect((clips[0].property("ADBE Effect Parade") as any).property(1).name).toBe("MES Balance");
  });
});
