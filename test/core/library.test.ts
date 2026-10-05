import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { groupByCategory, scanLibrary, searchItems, type LibraryItem } from "../../src/panel/core/library";
import { nodeScanFs } from "../../src/panel/node/library";
import type { NodeApi } from "../../src/panel/node/node";

function makeLibrary() {
  const root = mkdtempSync(path.join(tmpdir(), "mes-lib-"));
  const file = (rel: string, content = "") => {
    const p = path.join(root, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, content);
  };
  file("presets/Zooms/Punch_In.ffx");
  file("presets/Zooms/Punch_In.webm");
  file("presets/Zooms/Punch_In.json", JSON.stringify({ licence: "Own work", tags: ["zoom", "punch"] }));
  file("presets/Twixtors/Smooth slowmo.ffx");
  file("sounds/Whooshes/licence.txt", "Pack: Whoosh Essentials, licence #123\n");
  file("sounds/Whooshes/whoosh 1.wav");
  file("sounds/Whooshes/whoosh 2.mp3");
  file("sounds/Whooshes/notes.txt");
  file("textures/Dust/dust.png");
  file("textures/Dust/dust.mov");
  file("random/stuff/x.ffx");
  return root;
}

describe("library scan", () => {
  const n = { fs, path } as unknown as NodeApi;

  it("builds a manifest with previews, tags and licence sources", () => {
    const root = makeLibrary();
    const m = scanLibrary(nodeScanFs(n), root, new Date("2026-10-05T00:00:00Z"));
    const ids = m.items.map((i) => i.id);
    expect(ids).toEqual([
      "presets/Twixtors/Smooth slowmo.ffx",
      "presets/Zooms/Punch_In.ffx",
      "sounds/Whooshes/whoosh 1.wav",
      "sounds/Whooshes/whoosh 2.mp3",
      "textures/Dust/dust.mov",
      "textures/Dust/dust.png",
    ]);
    const punch = m.items.find((i) => i.name === "Punch In")!;
    expect(punch.preview).toBe(path.join(root, "presets/Zooms/Punch_In.webm"));
    expect(punch.tags).toEqual(["zoom", "punch"]);
    expect(punch.licence).toBe("Own work");
    expect(m.items.find((i) => i.name === "whoosh 1")!.licence).toBe("Pack: Whoosh Essentials, licence #123");
    expect(m.items.find((i) => i.category === "Twixtors")!.needsTwixtor).toBe(true);
    expect(m.items.find((i) => i.category === "Twixtors")!.licence).toBeNull();
  });
});

function fakeItems(n: number): LibraryItem[] {
  const cats = ["Whooshes", "Hits and punches", "Cars", "Thunder", "Camera"];
  return Array.from({ length: n }, (_, i) => ({
    id: `sounds/${cats[i % 5]}/item ${i}.wav`,
    tab: "sounds" as const,
    category: cats[i % 5],
    name: `${["deep", "fast", "metal", "soft"][i % 4]} ${cats[i % 5].toLowerCase()} ${i}`,
    file: `/lib/${i}.wav`,
    preview: null,
    tags: i % 7 === 0 ? ["cinematic"] : [],
    licence: "x",
    needsTwixtor: false,
  }));
}

describe("library search", () => {
  it("searches 2,000 items across all categories within 100 ms", () => {
    const items = fakeItems(2000);
    const started = performance.now();
    const hits = searchItems(items, "deep whoosh");
    const ms = performance.now() - started;
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.name.includes("deep") && h.category === "Whooshes")).toBe(true);
    expect(ms).toBeLessThan(100);
  });

  it("matches tags and requires every term", () => {
    const items = fakeItems(50);
    expect(searchItems(items, "cinematic").every((i) => i.tags.includes("cinematic"))).toBe(true);
    expect(searchItems(items, "metal zzz")).toEqual([]);
    expect(searchItems(items, "  ")).toHaveLength(50);
  });

  it("lists the PRD's starting categories first, including empty ones", () => {
    const groups = groupByCategory(fakeItems(10), "sounds", true);
    expect(groups[0].category).toBe("Buildups, risers and impacts");
    expect(groups[0].items).toEqual([]);
    expect(groups.find((g) => g.category === "Whooshes")!.items).toHaveLength(2);
  });
});
