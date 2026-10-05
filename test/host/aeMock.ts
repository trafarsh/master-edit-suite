/**
 * A small in-memory stand-in for the After Effects scripting object model, just
 * large enough to run the real host bundle (dist jsx) inside a Node vm context.
 * It models the behaviour the host relies on (layer timing, keyframes, effects,
 * project folders, undo groups); it is not a full simulation.
 */
import vm from "node:vm";
import { bundleHost } from "../../scripts/build-host.mjs";

let nextId = 1;
const EPS = 1e-6;

type Value = number | number[] | Record<string, unknown>;

function lerp(a: Value, b: Value, f: number): Value {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * f;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => v + (b[i] - v) * f);
  return f < 1 ? a : b;
}

export class Property {
  keys: { time: number; value: Value }[] = [];
  expression = "";
  expressionEnabled = false;
  dimensionsSeparated = false;
  constructor(public matchName: string, public value: Value, public name = matchName) {}
  get numKeys() {
    return this.keys.length;
  }
  keyTime(i: number) {
    return this.keys[i - 1].time;
  }
  keyValue(i: number) {
    return this.keys[i - 1].value;
  }
  setValue(v: Value) {
    if (this.keys.length) throw new Error(`setValue on keyframed property ${this.matchName}`);
    this.value = v;
  }
  setValueAtKey(i: number, v: Value) {
    this.keys[i - 1].value = v;
  }
  setValueAtTime(t: number, v: Value) {
    const hit = this.keys.find((k) => Math.abs(k.time - t) < EPS);
    if (hit) hit.value = v;
    else {
      this.keys.push({ time: t, value: v });
      this.keys.sort((a, b) => a.time - b.time);
    }
  }
  valueAtTime(t: number) {
    const k = this.keys;
    if (!k.length) return this.value;
    if (t <= k[0].time) return k[0].value;
    if (t >= k[k.length - 1].time) return k[k.length - 1].value;
    for (let i = 0; i < k.length - 1; i++) {
      if (t >= k[i].time && t <= k[i + 1].time) {
        return lerp(k[i].value, k[i + 1].value, (t - k[i].time) / (k[i + 1].time - k[i].time));
      }
    }
    return this.value;
  }
}

export class PropertyGroup {
  props: (Property | PropertyGroup)[] = [];
  parentGroup: PropertyGroup | null = null;
  constructor(public matchName: string, public name = matchName) {}
  get numProperties() {
    return this.props.length;
  }
  property(key: number | string) {
    if (typeof key === "number") return this.props[key - 1] ?? null;
    return this.props.find((p) => p.matchName === key || p.name === key) ?? null;
  }
  add<T extends Property | PropertyGroup>(p: T): T {
    if (p instanceof PropertyGroup) p.parentGroup = this;
    this.props.push(p);
    return p;
  }
  canAddProperty(matchName: string) {
    return this.matchName === "ADBE Effect Parade" && !matchName.startsWith("MISSING");
  }
  addProperty(matchName: string) {
    if (!this.canAddProperty(matchName)) throw new Error(`Cannot add ${matchName}`);
    return this.add(new Effect(matchName, EFFECT_NAMES[matchName] ?? matchName));
  }
}

const EFFECT_NAMES: Record<string, string> = {
  "ADBE Gaussian Blur 2": "Gaussian Blur",
  "ADBE Exposure2": "Exposure",
  "ADBE Tile": "Motion Tile",
  "ADBE Geometry2": "Transform",
};

export class Effect extends PropertyGroup {
  enabled = true;
  remove() {
    const g = this.parentGroup!;
    g.props.splice(g.props.indexOf(this), 1);
  }
}

export class Item {
  id = nextId++;
  _parentFolder: FolderItem | null = null;
  comment = "";
  constructor(public name: string) {}
  get parentFolder() {
    return this._parentFolder;
  }
  set parentFolder(f: FolderItem | null) {
    if (this._parentFolder) this._parentFolder.children.splice(this._parentFolder.children.indexOf(this), 1);
    this._parentFolder = f;
    if (f) f.children.push(this);
  }
  remove() {
    this.parentFolder = null;
    project.all.splice(project.all.indexOf(this), 1);
  }
}

export class FolderItem extends Item {
  children: Item[] = [];
  get numItems() {
    return this.children.length;
  }
  item(i: number) {
    return this.children[i - 1];
  }
}

export class SolidSource {
  isStill = true;
}
export class FileSource {
  constructor(public isStill = false) {}
}

export class FootageItem extends Item {
  constructor(
    name: string,
    public mainSource: SolidSource | FileSource,
    public hasVideo = true,
    public hasAudio = false,
    public width = 1920,
    public height = 1080,
  ) {
    super(name);
  }
}

export class Layer {
  id = nextId++;
  comp!: CompItem;
  _start = 0;
  _in = 0;
  _out = 1;
  locked = false;
  enabled = true;
  selected = false;
  label = 1;
  comment = "";
  stretch = 100;
  parent: Layer | null = null;
  nullLayer = false;
  adjustmentLayer = false;
  hasVideo = true;
  hasAudio = false;
  audioEnabled = true;
  timeRemapEnabled = false;
  threeDLayer = false;
  source: Item | null = null;
  root = new PropertyGroup("root");
  constructor(public name: string) {
    const tr = this.root.add(new PropertyGroup("ADBE Transform Group", "Transform"));
    tr.add(new Property("ADBE Anchor Point", [960, 540]));
    tr.add(new Property("ADBE Position", [960, 540]));
    tr.add(new Property("ADBE Position_0", 960));
    tr.add(new Property("ADBE Position_1", 540));
    tr.add(new Property("ADBE Scale", [100, 100]));
    tr.add(new Property("ADBE Rotate Z", 0));
    tr.add(new Property("ADBE Opacity", 100));
    this.root.add(new PropertyGroup("ADBE Effect Parade", "Effects"));
    this.root.add(new PropertyGroup("ADBE Marker", "Marker"));
  }
  get index() {
    return this.comp.layerList.indexOf(this) + 1;
  }
  get startTime() {
    return this._start;
  }
  set startTime(t: number) {
    this.assertUnlocked();
    const d = t - this._start;
    this._start = t;
    this._in += d;
    this._out += d;
  }
  get inPoint() {
    return this._in;
  }
  set inPoint(t: number) {
    this.assertUnlocked();
    this._in = t;
  }
  get outPoint() {
    return this._out;
  }
  set outPoint(t: number) {
    this.assertUnlocked();
    this._out = t;
  }
  assertUnlocked() {
    if (this.locked) throw new Error(`Layer ${this.name} is locked`);
  }
  property(key: number | string) {
    return this.root.property(key);
  }
  remove() {
    this.comp.layerList.splice(this.comp.layerList.indexOf(this), 1);
  }
  sourceRectAtTime() {
    const s = this.source as FootageItem | CompItem | null;
    return { left: 0, top: 0, width: s?.width ?? 100, height: s?.height ?? 100 };
  }
  setParentWithJump(p: Layer | null) {
    this.parent = p;
  }
}
export class AVLayer extends Layer {}
export class TextLayer extends AVLayer {}
export class ShapeLayer extends AVLayer {}
export class CameraLayer extends Layer {}
export class LightLayer extends Layer {}

export class CompItem extends Item {
  layerList: Layer[] = [];
  selectionOrder: Layer[] = [];
  time = 0;
  frameRate = 30;
  pixelAspect = 1;
  displayStartTime = 0;
  constructor(name: string, public width = 1920, public height = 1080, public duration = 10) {
    super(name);
  }
  get frameDuration() {
    return 1 / this.frameRate;
  }
  get numLayers() {
    return this.layerList.length;
  }
  layer(i: number) {
    return this.layerList[i - 1];
  }
  get selectedLayers() {
    return this.selectionOrder.filter((l) => l.selected && this.layerList.includes(l));
  }
  get usedIn() {
    return project.all.filter(
      (it): it is CompItem => it instanceof CompItem && it.layerList.some((l) => l.source === this),
    );
  }
  get layers() {
    return {
      addNull: (duration = this.duration) => {
        const l = this.addLayer(new AVLayer("Null"), 0, duration);
        l.nullLayer = true;
        return l;
      },
    };
  }
  /** Test helper: adds a layer at the top (index 1), like After Effects does. */
  addLayer<T extends Layer>(layer: T, inPoint: number, outPoint: number, opts: Partial<Layer> = {}): T {
    layer.comp = this;
    layer._start = inPoint;
    layer._in = inPoint;
    layer._out = outPoint;
    Object.assign(layer, opts);
    if (layer.hasAudio) {
      const audio = layer.root.add(new PropertyGroup("ADBE Audio Group", "Audio"));
      audio.add(new Property("ADBE Audio Levels", [0, 0], "Audio Levels"));
    }
    this.layerList.unshift(layer);
    return layer;
  }
  select(...layers: Layer[]) {
    this.layerList.forEach((l) => (l.selected = false));
    layers.forEach((l) => (l.selected = true));
    this.selectionOrder = layers;
  }
}

export class Project {
  all: Item[] = [];
  rootFolder = new FolderItem("Root");
  activeItem: Item | null = null;
  file: { displayName: string } | null = null;
  get numItems() {
    return this.all.length;
  }
  item(i: number) {
    return this.all[i - 1];
  }
  get items() {
    return {
      addFolder: (name: string) => this.addItem(new FolderItem(name)),
    };
  }
  addItem<T extends Item>(item: T): T {
    this.all.push(item);
    item.parentFolder = this.rootFolder;
    return item;
  }
}

let project = new Project();

export interface HostEnvelope<T = any> {
  ok: boolean;
  result?: T;
  undo?: string | null;
  warnings?: string[];
  error?: { message: string; code: string; step?: string | null; rolledBack?: number };
}

/** Fresh project + vm context running the real host bundle. */
export function createHost() {
  nextId = 1;
  project = new Project();
  const undoLog: string[] = [];
  let openGroups = 0;
  const app = {
    project,
    version: "24.0x0",
    buildName: "mock",
    isoLanguage: "en_US",
    purged: false,
    beginUndoGroup(name: string) {
      openGroups++;
      undoLog.push(name);
    },
    endUndoGroup() {
      openGroups--;
    },
    purge() {
      app.purged = true;
    },
  };
  const context = vm.createContext({
    app,
    CompItem,
    FootageItem,
    FolderItem,
    AVLayer,
    TextLayer,
    ShapeLayer,
    CameraLayer,
    LightLayer,
    SolidSource,
    FileSource,
    PurgeTarget: { ALL_CACHES: 1 },
    ParagraphJustification: { LEFT_JUSTIFY: 1 },
    RQItemStatus: { QUEUED: 1 },
  });
  vm.runInContext(bundleHost(), context);

  function call<T = any>(action: string, args: unknown = {}): HostEnvelope<T> {
    const raw = context.MES.call(action, JSON.stringify(args)) as string;
    return JSON.parse(raw);
  }

  return {
    app,
    project,
    call,
    /** Runs a raw script the way CEP's evalScript does and returns its string result. */
    evalScript(script: string): string {
      return String(vm.runInContext(script, context));
    },
    undoLog,
    get openGroups() {
      return openGroups;
    },
    /** A 1920x1080 30 fps comp, set as the active item. */
    comp(name = "Main", width = 1920, height = 1080, duration = 10) {
      const c = project.addItem(new CompItem(name, width, height, duration));
      project.activeItem = c;
      return c;
    },
    footage(name: string, opts: { still?: boolean; audioOnly?: boolean; solid?: boolean } = {}) {
      const src = opts.solid ? new SolidSource() : new FileSource(!!opts.still);
      return project.addItem(new FootageItem(name, src, !opts.audioOnly, !!opts.audioOnly));
    },
  };
}
