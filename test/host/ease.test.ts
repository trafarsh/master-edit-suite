import { describe, expect, it } from "vitest";
import { AVLayer, Property, createHost } from "./aeMock";

function keyed(name: string, keys: [number, number | number[]][], opts: Partial<Property> = {}) {
  const p = new Property(name, keys[0][1], name);
  Object.assign(p, opts);
  keys.forEach(([t, v]) => p.setValueAtTime(t, v));
  p.selectedKeys = keys.map((_, i) => i + 1);
  return p;
}

function setup(...props: Property[]) {
  const h = createHost();
  const c = h.comp();
  c.addLayer(new AVLayer("A"), 0, 5);
  c.selectedProperties = props;
  return h;
}

const CURVES: [string, number[]][] = [
  ["ease in-out", [0.42, 0, 0.58, 1]],
  ["snappy", [0.7, 0, 0.2, 1]],
  ["overshoot", [0.3, 1.4, 0.6, 1]],
  ["anticipate", [0.4, -0.3, 0.7, 1]],
];

describe("ease editor", () => {
  for (const [label, curve] of CURVES) {
    it(`apply then read returns the same ${label} curve within 1%`, () => {
      const p = keyed("Opacity", [
        [0, 0],
        [1, 100],
      ]);
      const h = setup(p);
      expect(h.call("ease.apply", { curve }).ok).toBe(true);
      const read = h.call("ease.read").result.curve as number[];
      read.forEach((v, i) => expect(Math.abs(v - curve[i])).toBeLessThan(0.01));
    });
  }

  it("works on 1D, 2D, 3D and spatial properties without changing keyframe values", () => {
    const props = [
      keyed("Rotation", [[0, 0], [2, 90]]),
      keyed("Scale", [[0, [100, 100]], [1, [50, 200]]]),
      keyed("Orientation", [[0, [0, 0, 0]], [1, [90, 45, 10]]]),
      keyed("Position", [[0, [0, 0]], [1, [300, 400]]], { isSpatial: true }),
    ];
    const before = props.map((p) => JSON.stringify(p.keys.map((k) => [k.time, k.value])));
    const h = setup(...props);
    const r = h.call("ease.apply", { curve: [0.5, 0.25, 0.5, 0.75] });
    expect(r.ok).toBe(true);
    expect(r.result).toEqual({ pairs: 4, properties: 4 });
    props.forEach((p, i) => expect(JSON.stringify(p.keys.map((k) => [k.time, k.value]))).toBe(before[i]));
    // Spatial: one ease along the path (distance 500 px over 1 s).
    const pos = props[3];
    expect(pos.keyOutTemporalEase(1)).toHaveLength(1);
    expect(pos.keyOutTemporalEase(1)[0].influence).toBeCloseTo(50);
    expect(pos.keyOutTemporalEase(1)[0].speed).toBeCloseTo(250); // 500 px/s * 0.25 / 0.5
    // 2D non-spatial: one ease per dimension, each with its own speed.
    const scale = props[1];
    expect(scale.keyInTemporalEase(2).map((e) => e.speed)).toEqual([-25, 50]);
  });

  it("eases every selected pair and keeps the outer sides of the run", () => {
    const p = keyed("Opacity", [[0, 0], [1, 100], [2, 0], [3, 100]]);
    p.selectedKeys = [1, 2, 3];
    const h = setup(p);
    const r = h.call("ease.apply", { curve: [0.5, 0, 0.5, 1] });
    expect(r.result.pairs).toBe(2);
    // Key 2 got both sides; key 3's outgoing side is untouched.
    expect(p.keyInTemporalEase(2)[0].influence).toBeCloseTo(50);
    expect(p.keyOutTemporalEase(2)[0].influence).toBeCloseTo(50);
    expect(p.keyOutTemporalEase(3)[0].influence).toBeCloseTo(16.666667);
  });

  it("explains when no keyframes are selected", () => {
    const h = setup();
    const r = h.call("ease.apply", { curve: [0.4, 0, 0.6, 1] });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("selection");
  });

  it("reports the selected keyframe pairs in state.get", () => {
    const p = keyed("Opacity", [[0, 0], [1, 100], [2, 50]]);
    const h = setup(p);
    expect(h.call("state.get").result.keys).toEqual({ properties: 1, pairs: 2 });
  });
});
