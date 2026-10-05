/**
 * Library scanning and search. Layout on disk:
 *
 *   <library>/<tab>/<category>/<item>            tab = presets | sounds | textures
 *   <library>/<tab>/<category>/<stem>.<preview>  optional preview with the same name
 *   <library>/<tab>/<category>/<stem>.json       optional { "licence": "...", "tags": [...] }
 *   <library>/<tab>/<category>/licence.txt       optional licence for the whole category
 *
 * The scan writes <library>/manifest.json. Every item records where its licence
 * comes from; items without one are flagged so nothing unlicensed ships unnoticed.
 */

export type LibraryTab = "presets" | "sounds" | "textures";

export const TABS: { id: LibraryTab; label: string }[] = [
  { id: "presets", label: "Presets" },
  { id: "sounds", label: "Sound effects" },
  { id: "textures", label: "Textures" },
];

/** Starting categories from the PRD; folders on disk add to these. */
export const STARTING_CATEGORIES: Record<LibraryTab, string[]> = {
  presets: ["Masks", "Shakes", "Slides", "Text", "Transitions", "Twixtors", "Zooms", "Other"],
  sounds: [
    "Buildups, risers and impacts",
    "Camera",
    "Cards",
    "Cars",
    "Explosions",
    "Guns and shots",
    "Hits and punches",
    "Knives and swords",
    "Misc",
    "Thunder",
    "Whooshes",
  ],
  textures: [],
};

const ITEM_EXT: Record<LibraryTab, string[]> = {
  presets: ["ffx"],
  sounds: ["wav", "mp3", "aif", "aiff", "m4a"],
  textures: ["png", "jpg", "jpeg", "tif", "tiff", "psd", "mov", "mp4"],
};
const PREVIEW_EXT = ["webm", "mp4", "mov", "gif", "png", "jpg", "jpeg"];

export interface LibraryItem {
  id: string;
  tab: LibraryTab;
  category: string;
  name: string;
  file: string;
  preview: string | null;
  tags: string[];
  /** Licence source, or null when none was recorded. */
  licence: string | null;
  /** Needs the paid third-party Twixtor plugin. */
  needsTwixtor: boolean;
}

export interface Manifest {
  version: 1;
  scannedAt: string;
  root: string;
  items: LibraryItem[];
}

/** The small slice of Node's fs/path the scan needs; injectable for tests. */
export interface ScanFs {
  readdir(dir: string): { name: string; isDirectory: boolean }[];
  readText(file: string): string | null;
  join(...parts: string[]): string;
}

function splitExt(file: string): [string, string] {
  const i = file.lastIndexOf(".");
  return i <= 0 ? [file, ""] : [file.slice(0, i), file.slice(i + 1).toLowerCase()];
}

function prettyName(stem: string): string {
  return stem.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
}

function readSidecar(fs: ScanFs, file: string): { licence?: string; tags?: string[] } {
  const raw = fs.readText(file);
  if (!raw) return {};
  try {
    const j = JSON.parse(raw);
    return {
      licence: typeof j.licence === "string" && j.licence.trim() ? j.licence.trim() : undefined,
      tags: Array.isArray(j.tags) ? j.tags.filter((t: unknown): t is string => typeof t === "string") : undefined,
    };
  } catch {
    return {};
  }
}

export function scanLibrary(fs: ScanFs, root: string, now = new Date()): Manifest {
  const items: LibraryItem[] = [];
  for (const tabDir of fs.readdir(root).filter((d) => d.isDirectory)) {
    const tab = tabDir.name.toLowerCase() as LibraryTab;
    if (!(tab in ITEM_EXT)) continue;
    const tabPath = fs.join(root, tabDir.name);
    for (const catDir of fs.readdir(tabPath).filter((d) => d.isDirectory)) {
      const catPath = fs.join(tabPath, catDir.name);
      const files = fs.readdir(catPath).filter((f) => !f.isDirectory).map((f) => f.name);
      const categoryLicence = (fs.readText(fs.join(catPath, "licence.txt")) ?? fs.readText(fs.join(catPath, "LICENSE.txt")))?.trim() || null;
      const byStem = new Map<string, string[]>();
      for (const f of files) {
        const [stem, ext] = splitExt(f);
        byStem.set(stem.toLowerCase(), [...(byStem.get(stem.toLowerCase()) ?? []), ext]);
      }
      for (const f of files) {
        const [stem, ext] = splitExt(f);
        if (!ITEM_EXT[tab].includes(ext)) continue;
        // A texture video with a same-named still is still an item, not a preview.
        const siblings = (byStem.get(stem.toLowerCase()) ?? []).filter((e) => e !== ext);
        const previewExt = tab === "sounds" || tab === "textures" ? null : PREVIEW_EXT.find((e) => siblings.includes(e)) ?? null;
        const previewName = previewExt ? files.find((x) => splitExt(x)[0].toLowerCase() === stem.toLowerCase() && splitExt(x)[1] === previewExt) : null;
        const sidecar = siblings.includes("json") ? readSidecar(fs, fs.join(catPath, `${stem}.json`)) : {};
        const name = prettyName(stem);
        const category = catDir.name;
        items.push({
          id: `${tab}/${category}/${f}`,
          tab,
          category,
          name,
          file: fs.join(catPath, f),
          preview: previewName ? fs.join(catPath, previewName) : null,
          tags: sidecar.tags ?? [],
          licence: sidecar.licence ?? categoryLicence,
          needsTwixtor: tab === "presets" && /twixtor/i.test(`${category} ${name}`),
        });
      }
    }
  }
  items.sort((a, b) => a.tab.localeCompare(b.tab) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return { version: 1, scannedAt: now.toISOString(), root, items };
}

/** Every whitespace-separated term must match the name, category or a tag. */
export function searchItems(items: LibraryItem[], query: string): LibraryItem[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  return items.filter((it) => {
    const hay = `${it.name} ${it.category} ${it.tags.join(" ")}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

export interface CategoryGroup {
  category: string;
  items: LibraryItem[];
}

/** Groups a tab's items by category: starting categories first, then any others alphabetically. */
export function groupByCategory(items: LibraryItem[], tab: LibraryTab, includeEmpty: boolean): CategoryGroup[] {
  const map = new Map<string, LibraryItem[]>();
  for (const c of STARTING_CATEGORIES[tab]) if (includeEmpty) map.set(c, []);
  for (const it of items) {
    if (it.tab !== tab) continue;
    const key = [...map.keys()].find((k) => k.toLowerCase() === it.category.toLowerCase()) ?? it.category;
    map.set(key, [...(map.get(key) ?? []), it]);
  }
  const starting = STARTING_CATEGORIES[tab].map((c) => c.toLowerCase());
  return [...map.entries()]
    .map(([category, list]) => ({ category, items: list }))
    .sort((a, b) => {
      const ia = starting.indexOf(a.category.toLowerCase());
      const ib = starting.indexOf(b.category.toLowerCase());
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      return a.category.localeCompare(b.category);
    });
}

export function isManifest(v: unknown): v is Manifest {
  return !!v && typeof v === "object" && (v as Manifest).version === 1 && Array.isArray((v as Manifest).items);
}
