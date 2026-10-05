/** Transition recipes: types, validation and the bundled set. Format: recipes/README.md. */

export type ParamSpec =
  | number
  | string
  | (number | string)[]
  | { keys: [number | string, unknown, ("smooth" | "linear" | "hold")?][]; rest?: unknown; ease?: string }
  | { expression: string };

export interface RecipeLayer {
  type: "adjustment" | "solid";
  name?: string;
  color?: [number, number, number];
  blendMode?: string;
  transform?: Record<string, ParamSpec>;
  effects?: { matchName: string; params: Record<string, ParamSpec> }[];
}

export interface Recipe {
  id: string;
  name: string;
  lengthFrames: number;
  notes?: string;
  layers: RecipeLayer[];
  /** Where it came from: "bundled" or a file path. */
  source?: string;
}

const EASES = ["smooth", "linear", "hold"];

function checkParam(p: unknown, where: string, errors: string[]) {
  if (typeof p === "number" || typeof p === "string") return;
  if (Array.isArray(p)) {
    if (!p.every((v) => typeof v === "number" || typeof v === "string")) errors.push(`${where}: array values must be numbers or formulas`);
    return;
  }
  if (p && typeof p === "object") {
    const o = p as Record<string, unknown>;
    if (typeof o.expression === "string") return;
    if (Array.isArray(o.keys)) {
      if (o.keys.length < 2) errors.push(`${where}: needs at least two keys`);
      o.keys.forEach((k, i) => {
        if (!Array.isArray(k) || k.length < 2) return errors.push(`${where} key ${i + 1}: expected [u, value, ease?]`);
        const u = k[0];
        if (typeof u === "number" ? u < 0 || u > 1 : !/^c([+-]\d+)?$/.test(String(u))) errors.push(`${where} key ${i + 1}: u must be 0..1 or "c±frames"`);
        if (k[2] !== undefined && !EASES.includes(k[2])) errors.push(`${where} key ${i + 1}: unknown ease "${k[2]}"`);
      });
      return;
    }
  }
  errors.push(`${where}: expected a value, { keys } or { expression }`);
}

/** Returns a list of problems; empty means the recipe is usable. */
export function validateRecipe(r: unknown): string[] {
  const errors: string[] = [];
  if (!r || typeof r !== "object") return ["not an object"];
  const o = r as Partial<Recipe>;
  if (!o.id || !/^[a-z0-9-]+$/.test(o.id)) errors.push("id: lowercase letters, digits and dashes");
  if (!o.name) errors.push("name is missing");
  if (!(typeof o.lengthFrames === "number" && o.lengthFrames >= 2 && o.lengthFrames <= 240)) errors.push("lengthFrames: 2 to 240");
  if (!Array.isArray(o.layers) || !o.layers.length) errors.push("layers: at least one");
  (o.layers ?? []).forEach((l, i) => {
    const at = `layer ${i + 1}`;
    if (l.type !== "adjustment" && l.type !== "solid") errors.push(`${at}: type must be adjustment or solid`);
    Object.entries(l.transform ?? {}).forEach(([k, p]) => checkParam(p, `${at} transform ${k}`, errors));
    (l.effects ?? []).forEach((e, j) => {
      if (!e.matchName) errors.push(`${at} effect ${j + 1}: matchName missing`);
      Object.entries(e.params ?? {}).forEach(([k, p]) => checkParam(p, `${at} ${e.matchName} #${k}`, errors));
    });
  });
  return errors;
}

const bundledModules = import.meta.glob("../../../recipes/transitions/*.json", { eager: true, import: "default" });

export const BUNDLED_RECIPES: Recipe[] = Object.values(bundledModules).map((r) => ({ ...(r as Recipe), source: "bundled" }));

/** Order of the PRD's bundle list; other recipes follow alphabetically. */
export const TRANSITION_ORDER = [
  "shake-flash",
  "zoom-into-edit",
  "smooth-parallel",
  "warp-flash",
  "hyperlapse",
  "glitch-shake",
  "glitch",
  "flash",
  "blur-flash",
];

export function sortRecipes(list: Recipe[]): Recipe[] {
  const rank = (r: Recipe) => {
    const i = TRANSITION_ORDER.indexOf(r.id);
    return i < 0 ? 999 : i;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Library recipes override bundled ones with the same id. */
export function mergeRecipes(bundled: Recipe[], extra: Recipe[]): Recipe[] {
  const map = new Map(bundled.map((r) => [r.id, r]));
  for (const r of extra) map.set(r.id, r);
  return sortRecipes([...map.values()]);
}
