/**
 * Browser-only stand-in for After Effects so the panel can be developed and
 * reviewed with `npm run dev`. It answers host actions with plausible data; it
 * never pretends to edit anything. Not bundled into behaviour inside AE: callHost
 * only reaches it when window.__adobe_cep__ is missing.
 */
import type { LibraryItem, LibraryTab, Manifest } from "../core/library";
import type { CompInfo, FxGroup, HostState, LayerInfo, LayerKind, PingResult } from "./types";

const comp: CompInfo = {
  id: 1,
  name: "Edit 01",
  width: 1080,
  height: 1920,
  pixelAspect: 1,
  frameRate: 30,
  frameDuration: 1 / 30,
  duration: 20,
  time: 4.2,
  displayStartTime: 0,
  numLayers: 9,
};

function layer(index: number, name: string, kind: LayerKind, inPoint: number, outPoint: number, extra: Partial<LayerInfo> = {}): LayerInfo {
  return {
    index,
    id: 100 + index,
    name,
    kind,
    inPoint,
    outPoint,
    startTime: inPoint,
    stretch: 100,
    locked: false,
    enabled: true,
    hasVideo: kind !== "audio",
    hasAudio: kind === "audio" || kind === "footage",
    timeRemap: false,
    threeD: false,
    sourceId: 10 + index,
    numEffects: 0,
    parentIndex: null,
    comment: "",
    ...extra,
  };
}

const layers: LayerInfo[] = [
  layer(1, "Title", "text", 0, 2),
  layer(2, "clip_06.mp4", "footage", 9.4, 10.6),
  layer(3, "clip_05.mp4", "footage", 8.2, 9.4),
  layer(4, "clip_04.mp4", "footage", 7.0, 8.2),
  layer(5, "clip_03.mp4", "footage", 5.8, 7.0, { numEffects: 2 }),
  layer(6, "clip_02.mp4", "footage", 4.6, 5.8),
  layer(7, "clip_01.mp4", "footage", 3.4, 4.6, { numEffects: 1 }),
  layer(8, "intro.mp4", "footage", 0, 3.4),
  layer(9, "song.wav", "audio", 0, 20),
];

export const mock = {
  hasComp: true,
  selection: [2, 3, 4, 5, 6, 7] as number[],
};

const listeners = new Set<() => void>();
export function onMockChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function setMockSelection(kind: "none" | "clips" | "audio" | "text" | "all") {
  mock.hasComp = true;
  mock.selection =
    kind === "none" ? [] : kind === "clips" ? [2, 3, 4, 5, 6, 7] : kind === "audio" ? [9] : kind === "text" ? [1] : layers.map((l) => l.index);
  listeners.forEach((fn) => fn());
}
export function setMockComp(open: boolean) {
  mock.hasComp = open;
  listeners.forEach((fn) => fn());
}

const fxGroups: FxGroup[] = [
  { matchName: "ADBE Gaussian Blur 2", name: "Gaussian Blur", count: 4, on: 4, state: "on", layerIds: [105, 107] },
  { matchName: "ADBE Lumetri", name: "Lumetri Color", count: 2, on: 1, state: "mixed", layerIds: [105] },
  { matchName: "ADBE Tile", name: "Motion Tile", count: 6, on: 0, state: "off", layerIds: [102, 103] },
];

function state(): HostState {
  return {
    project: { name: "short-edit.aep", saved: true, numItems: 24 },
    comp: mock.hasComp ? comp : null,
    selection: mock.hasComp ? layers.filter((l) => mock.selection.includes(l.index)) : [],
    keys: mock.hasComp && mock.selection.length ? { properties: 1, pairs: 2 } : { properties: 0, pairs: 0 },
  };
}

function ok(result: unknown, undo: string | null = null, warnings: string[] = []) {
  return JSON.stringify({ ok: true, result, undo, warnings });
}
function fail(message: string, code = "user") {
  return JSON.stringify({ ok: false, error: { message, code }, undo: null, warnings: [] });
}

const UNDO: Record<string, string> = {
  "arrange.moveToPlayhead": "Move to Playhead",
  "arrange.staircase": "Staircase Layers",
  "arrange.precomposeEach": "Pre-compose Each",
  "arrange.unprecompose": "Un-precompose",
  "arrange.duplicateComp": "Duplicate Comp (Independent)",
  "arrange.splitTextByWord": "Split Text by Word",
  "audio.fade": "Fade Audio",
  "audio.volume": "Volume",
  "project.resizeLayers": "Resize and Center",
  "project.reframeComp": "Reframe Comp",
  "project.tidyBin": "Tidy Project Bin",
  "cuts.detect": "Detect Cuts",
  "cuts.split": "Split at Cuts",
  "cuts.adjustmentPerCut": "Adjustment Layer per Cut",
  "ease.apply": "Apply Ease",
  "library.applyPreset": "Apply Preset",
  "color.balance": "Balance Brightness",
  "library.insertSound": "Insert Sound Effect",
  "library.insertTexture": "Insert Texture",
};

export async function mockCall(action: string, args: unknown): Promise<string> {
  await new Promise((r) => setTimeout(r, 60));
  const a = (args ?? {}) as Record<string, unknown>;
  const sel = state().selection;
  if (action === "host.ping") {
    const ping: PingResult = {
      hostVersion: "mock",
      aeVersion: "26.0 (browser mock)",
      buildName: "mock",
      os: navigator.platform,
      language: "en_US",
      actions: Object.keys(UNDO),
    };
    return ok(ping);
  }
  if (action === "state.get") return ok(state());
  if (!mock.hasComp && action !== "project.tidyBin" && action !== "project.purge") return fail("Open a composition first.", "no_comp");
  switch (action) {
    case "fx.list":
      return ok({ groups: fxGroups, total: 12, layers: comp.numLayers });
    case "fx.setEnabled": {
      const changed: unknown[] = [];
      for (const g of fxGroups) {
        if (a.matchName && g.matchName !== a.matchName) continue;
        g.on = a.enabled ? g.count : 0;
        g.state = a.enabled ? "on" : "off";
        changed.push({ layerId: 101, index: 1, matchName: g.matchName });
      }
      return ok({ changed }, a.enabled ? "Enable Effects" : "Disable Effects");
    }
    case "fx.selectLayers":
      return ok({ selected: 2 });
    case "transitions.apply":
      return ok({ layers: 1, center: comp.time }, `Transition: ${(a.recipe as { name?: string })?.name ?? ""}`);
    case "autoedit.inspect": {
      const clips = sel.filter((l) => ["footage", "precomp", "still"].includes(l.kind)).sort((x, y) => x.inPoint - y.inPoint);
      return ok({
        ids: clips.map((l) => l.id),
        names: clips.map((l) => l.name),
        clips: clips.length,
        start: clips[0]?.inPoint ?? 0,
        end: clips.length ? Math.max(...clips.map((l) => l.outPoint)) : 0,
        switches: clips.slice(1).map((l) => l.inPoint),
        needPrecompose: clips.filter((l) => l.kind !== "precomp").length,
        shortClips: [],
        stills: [],
        timeRemapped: [],
        overlaps: [],
        hasIntro: true,
        notes: [],
      });
    }
    case "autoedit.run": {
      const ids = (a.clipIds as number[]) ?? [];
      return ok({ clips: ids.length, cuts: Math.max(0, ids.length - 1), precomposed: ids.length }, "Auto Edit");
    }
    case "host.findEffects":
      return ok({ matchNames: [] });
    case "library.insertSound":
      return ok({ name: "whoosh.wav", time: comp.time }, UNDO[action]);
    case "library.insertTexture":
      return ok({ name: "dust.png" }, UNDO[action]);
    case "project.render":
      return fail("Rendering needs After Effects; the browser mock cannot render.", "mock");
    case "project.saveFramePng":
      return ok({ file: String(a.path), time: comp.time });
    case "project.purge":
      return ok({ purged: true });
    case "project.tidyBin":
      return ok({ moved: 9, counts: { Comps: 1, Precomps: 2, Footage: 4, Audio: 1, Images: 1 } }, UNDO[action]);
    case "project.reframeComp":
      return ok({ width: a.width, height: a.height, moved: comp.numLayers }, UNDO[action]);
    default: {
      // Result shapes mirror the real host actions in src/host.
      const n = sel.length;
      const results: Record<string, unknown> = {
        "arrange.moveToPlayhead": { moved: n, delta: 1.2 },
        "arrange.staircase": { arranged: n },
        "arrange.precomposeEach": { precomposed: n },
        "arrange.unprecompose": { unprecomposed: n },
        "arrange.duplicateComp": { name: `${comp.name} (independent)`, id: 99, duplicated: 3 },
        "arrange.splitTextByWord": { words: 4 },
        "audio.fade": { layers: n, seconds: a.seconds },
        "audio.volume": { layers: n, keys: 0, db: a.db },
        "project.resizeLayers": { resized: n },
        "cuts.detect": { cuts: 3, times: [1, 2, 3] },
        "cuts.split": { shots: 4 },
        "cuts.adjustmentPerCut": { shots: 4, cuts: 3 },
        "ease.apply": { pairs: 2, properties: 1 },
        "library.applyPreset": { layers: n },
        "color.balance": { clips: n, results: sel.map((l, i) => ({ name: l.name, luma: 0.3, stops: [0.4, 0, 1.1, -0.3, 0.6, 0.2][i % 6] })) },
        "ease.read": { curve: [0.7, 0, 0.2, 1], property: "Scale" },
      };
      if (!(action in results)) return fail(`Unknown host action: ${action}`, "unknown_action");
      if (!n && action !== "arrange.duplicateComp") return fail("Select at least one layer.", "selection");
      return ok(results[action], UNDO[action]);
    }
  }
}

/** Sample library for the browser preview (the real one is scanned from disk). */
export function mockManifest(): Manifest {
  const item = (tab: LibraryTab, category: string, name: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({
    id: `${tab}/${category}/${name}`,
    tab,
    category,
    name,
    file: `/library/${tab}/${category}/${name}`,
    preview: null,
    tags: [],
    licence: "Own work",
    needsTwixtor: false,
    ...extra,
  });
  return {
    version: 1,
    scannedAt: new Date().toISOString(),
    root: "/library",
    items: [
      item("presets", "Zooms", "Punch in"),
      item("presets", "Zooms", "Slow push"),
      item("presets", "Shakes", "Hard shake"),
      item("presets", "Shakes", "Handheld"),
      item("presets", "Twixtors", "Smooth slowmo", { needsTwixtor: true, licence: null }),
      item("presets", "Text", "Pop in"),
      item("sounds", "Whooshes", "Whoosh fast 1"),
      item("sounds", "Whooshes", "Whoosh deep"),
      item("sounds", "Hits and punches", "Punch heavy"),
      item("sounds", "Camera", "Shutter"),
      item("textures", "Dust", "Dust overlay"),
      item("textures", "Light leaks", "Leak warm"),
    ],
  };
}
