/**
 * Persists settings to <dataDir>/settings.json (never into the project file).
 * Falls back to localStorage when running in a plain browser.
 */
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from "../core/settings";
import { logger } from "./logger";
import { node } from "./node";
import { dataDir, ensureDir } from "./paths";

const LS_KEY = "mes.settings";

function file(): string | null {
  const n = node();
  return n ? n.path.join(dataDir(n), "settings.json") : null;
}

export function loadSettings(): Settings {
  const n = node();
  const f = file();
  try {
    if (n && f) {
      return n.fs.existsSync(f) ? normalizeSettings(JSON.parse(n.fs.readFileSync(f, "utf8"))) : { ...DEFAULT_SETTINGS };
    }
    const raw = localStorage.getItem(LS_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch (e) {
    logger.warn("Settings could not be read; using defaults", { error: String(e) });
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  const n = node();
  const f = file();
  try {
    if (n && f) {
      ensureDir(n, n.path.dirname(f));
      // Write then rename so a crash never leaves a half-written settings file.
      const tmp = `${f}.tmp`;
      n.fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
      n.fs.renameSync(tmp, f);
    } else {
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    }
  } catch (e) {
    logger.error("Settings could not be saved", { error: String(e) });
  }
}

export function settingsFilePath(): string | null {
  return file();
}
