import { describe, expect, it } from "vitest";
import { BUNDLED_RECIPES, validateRecipe, type Recipe } from "../../src/panel/core/recipes";
import { AVLayer, Property, createHost } from "./aeMock";

const recipe = (id: string) => BUNDLED_RECIPES.find((r) => r.id === id)!;

function setup(time = 2) {
  const h = createHost();
  const c = h.comp();
  c.addLayer(new AVLayer("clip B"), 2, 4, { source: h.footage("b.mp4") });
  c.addLayer(new AVLayer("clip A"), 0, 2, { source: h.footage("a.mp4") });
  c.time = time;
  return { h, c };
}

const opacity = (l: AVLayer) => (l.property("ADBE Transform Group") as any).property("ADBE Opacity") as Property;

describe("bundled transition recipes", () => {
  it("ships the PRD's seven bundles plus Auto Edit's flashes, all valid", () => {
    const ids = BUNDLED_RECIPES.map((r) => r.id).sort();
    expect(ids).toEqual(
      ["blur-flash", "flash", "glitch", "glitch-shake", "hyperlapse", "shake-flash", "smooth-parallel", "warp-flash", "zoom-into-edit"].sort(),
    );
    for (const r of BUNDLED_RECIPES) expect([r.id, validateRecipe(r)]).toEqual([r.id, []]);
  });

  it("rejects malformed recipes with readable reasons", () => {
    expect(validateRecipe({ id: "X", name: "", lengthFrames: 1, layers: [] })).toEqual([
      "id: lowercase letters, digits and dashes",
      "name is missing",
      "lengthFrames: 2 to 240",
      "layers: at least one",
    ]);
    const bad = { id: "x", name: "X", lengthFrames: 8, layers: [{ type: "adjustment", transform: { "ADBE Opacity": { keys: [[2, 0], [0.5, 1, "bouncy"]] } } }] };
    expect(validateRecipe(bad)).toEqual([
      'layer 1 transform ADBE Opacity key 1: u must be 0..1 or "c±frames"',
      'layer 1 transform ADBE Opacity key 2: unknown ease "bouncy"',
    ]);
  });
});

describe("transitions.apply", () => {
  it("centres a flash on the playhead frame with its peak exactly on the cut", () => {
    const { h, c } = setup(2);
    const r = h.call("transitions.apply", { recipe: recipe("flash"), lengthFrames: 6, intensity: 1 });
    expect(r.ok).toBe(true);
    expect(r.undo).toBe("Transition: Flash");
    expect(h.undoLog).toHaveLength(1);
    const flash = c.layerList[0];
    expect(flash.name).toBe("TR · Flash");
    expect(flash.comment).toBe("mes:transition:flash");
    expect([flash.inPoint, flash.outPoint]).toEqual([2 - 3 / 30, 2 + 3 / 30]);
    const keys = opacity(flash).keys;
    expect(keys.map((k) => +k.time.toFixed(6))).toEqual([+(2 - 3 / 30).toFixed(6), 2, +(2 + 3 / 30).toFixed(6)]);
    expect(keys[1].value).toBe(85);
  });

  it("midpoint stays on the playhead frame for odd lengths too", () => {
    const { h, c } = setup(1);
    h.call("transitions.apply", { recipe: recipe("flash"), lengthFrames: 7 });
    const keys = opacity(c.layerList[0]).keys;
    expect(keys[1].time).toBe(1);
  });

  it("scales away from rest by intensity", () => {
    const { h, c } = setup(2);
    h.call("transitions.apply", { recipe: recipe("flash"), intensity: 0.5 });
    expect(opacity(c.layerList[0]).keys[1].value).toBe(42.5);
  });

  it("builds multi-layer recipes top-down with frame-exact jump keys", () => {
    const { h, c } = setup(2);
    const r = h.call("transitions.apply", { recipe: recipe("zoom-into-edit"), lengthFrames: 12 });
    expect(r.ok).toBe(true);
    const zoom = c.layerList[0];
    expect(zoom.adjustmentLayer).toBe(true);
    const fx = zoom.property("ADBE Effect Parade") as any;
    expect(fx.property(1).matchName).toBe("ADBE Tile");
    expect(fx.property(1).property(6).value).toBe(1); // mirror edges
    const scale = fx.property(2).property(4) as Property;
    expect(scale.keys.map((k) => [+(k.time * 30).toFixed(3), k.value])).toEqual([
      [54, 100],
      [59, 210],
      [60, 55],
      [66, 100],
    ]);
    expect(scale.keyOutInterpolationType(2)).toBe(6614); // hold into the cut

    const shake = h.call("transitions.apply", { recipe: recipe("shake-flash") });
    expect(shake.ok).toBe(true);
    expect(c.layerList.slice(0, 2).map((l) => l.name)).toEqual(["TR · Flash", "TR · Shake"]);
    const pos = (c.layerList[1].property("ADBE Effect Parade") as any).property(2).property(2) as Property;
    expect(pos.expression).toContain("var d = time - 2;");
  });

  it("skips a parameter that does not exist with a warning instead of failing", () => {
    const { h, c } = setup(2);
    const r = h.call("transitions.apply", { recipe: recipe("glitch") });
    expect(r.ok).toBe(true);
    // The mock has no Turbulent Displace parameters.
    expect(r.warnings!.some((w: string) => w.includes("ADBE Turbulent Displace #2: parameter not found"))).toBe(true);
    expect(c.layerList[0].name).toBe("TR · Glitch");
  });

  it("refuses an empty recipe", () => {
    const { h } = setup();
    const r = h.call("transitions.apply", { recipe: { id: "x", name: "X", lengthFrames: 4, layers: [] } as Recipe });
    expect(r.ok).toBe(false);
  });
});
