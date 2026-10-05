import { extensionPath } from "../bridge/cep";
import { node, type NodeApi } from "./node";

export const APP_DIR_NAME = "MasterEditSuite";

/** Per-user data folder: settings, logs and usage logs live here. */
export function dataDir(n: NodeApi): string {
  const { path, os, env, platform } = n;
  if (platform === "win32") return path.join(env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_DIR_NAME);
  if (platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", APP_DIR_NAME);
  return path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), APP_DIR_NAME);
}

export function defaultOutputFolder(n: NodeApi): string {
  const videos = n.platform === "darwin" ? "Movies" : "Videos";
  return n.path.join(n.os.homedir(), videos, "Master Edit Suite");
}

export function ensureDir(n: NodeApi, dir: string): string {
  n.fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** ffmpeg to use: explicit setting, then bin/ inside the extension, then PATH. */
export function resolveFfmpeg(configured: string): string {
  const n = node();
  if (configured) return configured;
  const ext = extensionPath();
  if (n && ext) {
    const bundled = n.path.join(ext, "bin", n.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
    if (n.fs.existsSync(bundled)) return bundled;
  }
  return "ffmpeg";
}

export function openFolder(dir: string): void {
  const n = node();
  if (!n) return;
  const cmd = n.platform === "win32" ? "explorer.exe" : n.platform === "darwin" ? "open" : "xdg-open";
  n.childProcess.spawn(cmd, [dir], { detached: true, stdio: "ignore" }).unref();
}
