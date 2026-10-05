/** Node side of the Library: scans the library folder and reads/writes manifest.json. */
import { isManifest, scanLibrary, type Manifest, type ScanFs } from "../core/library";
import { logger } from "./logger";
import { node, type NodeApi } from "./node";

export function nodeScanFs(n: NodeApi): ScanFs {
  return {
    readdir: (dir) =>
      n.fs.readdirSync(dir, { withFileTypes: true }).map((d) => ({ name: d.name, isDirectory: d.isDirectory() })),
    readText: (file) => {
      try {
        return n.fs.readFileSync(file, "utf8");
      } catch {
        return null;
      }
    },
    join: (...parts) => n.path.join(...parts),
  };
}

function requireLibrary(root: string): NodeApi {
  const n = node();
  if (!n) throw new Error("The Library needs After Effects (file access is unavailable in the browser preview).");
  if (!root) throw new Error("Set the library folder first.");
  if (!n.fs.existsSync(root)) throw new Error(`The library folder ${root} does not exist.`);
  return n;
}

/** Rescans the folder and rewrites manifest.json. */
export function rescanLibrary(root: string): Manifest {
  const n = requireLibrary(root);
  const started = performance.now();
  const manifest = scanLibrary(nodeScanFs(n), root);
  try {
    n.fs.writeFileSync(n.path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  } catch (e) {
    logger.warn("manifest.json could not be written; the scan is still used", { error: String(e) });
  }
  logger.info(`Library scan: ${manifest.items.length} items in ${Math.round(performance.now() - started)} ms`);
  return manifest;
}

/** Reads manifest.json, scanning first if it is missing, unreadable or from another root. */
export function loadLibrary(root: string): Manifest {
  const n = requireLibrary(root);
  try {
    const m = JSON.parse(n.fs.readFileSync(n.path.join(root, "manifest.json"), "utf8"));
    if (isManifest(m) && m.root === root) return m;
  } catch {
    // Missing or broken manifest: rebuild it below.
  }
  return rescanLibrary(root);
}

/** file:// URL for previews in the panel (audio, video, images). */
export function fileUrl(path: string): string {
  const p = path.replace(/\\/g, "/");
  return encodeURI(`file://${p.startsWith("/") ? "" : "/"}${p}`).replace(/#/g, "%23").replace(/\?/g, "%3F");
}
