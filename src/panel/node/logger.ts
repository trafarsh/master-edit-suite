/**
 * Rotating local log: <dataDir>/logs/mes.log, rotated at 1 MB, three files kept.
 * A ring buffer of recent lines feeds "Copy diagnostics". No telemetry: nothing
 * here ever leaves the machine.
 */
import { node } from "./node";
import { dataDir, ensureDir } from "./paths";

export type Level = "debug" | "info" | "warn" | "error";

const MAX_BYTES = 1024 * 1024;
const KEEP = 3;
const RING = 200;
const recent: string[] = [];

export function logDir(): string | null {
  const n = node();
  return n ? n.path.join(dataDir(n), "logs") : null;
}

function rotate(file: string) {
  const n = node()!;
  try {
    if (!n.fs.existsSync(file) || n.fs.statSync(file).size < MAX_BYTES) return;
    for (let i = KEEP - 1; i >= 1; i--) {
      const from = i === 1 ? file : `${file}.${i - 1}`;
      if (n.fs.existsSync(from)) n.fs.renameSync(from, `${file}.${i}`);
    }
  } catch {
    // Rotation is best effort; logging must never break an action.
  }
}

export function log(level: Level, message: string, data?: unknown): void {
  let line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  if (data !== undefined) {
    try {
      line += ` ${JSON.stringify(data)}`;
    } catch {
      line += " [unserialisable data]";
    }
  }
  recent.push(line);
  if (recent.length > RING) recent.shift();
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  const n = node();
  const dir = logDir();
  if (!n || !dir) return;
  try {
    ensureDir(n, dir);
    const file = n.path.join(dir, "mes.log");
    rotate(file);
    n.fs.appendFileSync(file, line + "\n");
  } catch {
    // Disk full or read-only: the ring buffer still has the line.
  }
}

export const logger = {
  debug: (m: string, d?: unknown) => log("debug", m, d),
  info: (m: string, d?: unknown) => log("info", m, d),
  warn: (m: string, d?: unknown) => log("warn", m, d),
  error: (m: string, d?: unknown) => log("error", m, d),
};

export function recentLog(): string[] {
  return [...recent];
}
