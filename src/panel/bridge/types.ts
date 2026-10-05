/** Shapes returned by the ExtendScript host layer (src/host). Keep in sync with it. */

export type LayerKind =
  | "footage"
  | "still"
  | "audio"
  | "precomp"
  | "text"
  | "shape"
  | "solid"
  | "adjustment"
  | "null"
  | "camera"
  | "light"
  | "other";

export interface LayerInfo {
  index: number;
  id: number;
  name: string;
  kind: LayerKind;
  inPoint: number;
  outPoint: number;
  startTime: number;
  stretch: number;
  locked: boolean;
  enabled: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  timeRemap: boolean;
  threeD: boolean;
  sourceId: number | null;
  numEffects: number;
  parentIndex: number | null;
  comment: string;
}

export interface CompInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  pixelAspect: number;
  frameRate: number;
  frameDuration: number;
  duration: number;
  time: number;
  displayStartTime: number;
  numLayers: number;
}

export interface HostState {
  project: { name: string; saved: boolean; numItems: number } | null;
  comp: CompInfo | null;
  selection: LayerInfo[];
}

export interface HostError {
  message: string;
  code: string;
  step?: string | null;
  rolledBack?: number;
  details?: Record<string, unknown>;
}

export type HostResult<T> =
  | { ok: true; result: T; undo: string | null; warnings: string[] }
  | { ok: false; error: HostError; undo: string | null; warnings: string[] };

export interface PingResult {
  hostVersion: string;
  aeVersion: string;
  buildName: string;
  os: string;
  language: string;
  actions: string[];
}

export interface FxGroup {
  matchName: string;
  name: string;
  count: number;
  on: number;
  state: "on" | "off" | "mixed";
  layerIds: number[];
}

export interface FxInstanceRef {
  layerId: number;
  index: number;
  matchName: string;
}
