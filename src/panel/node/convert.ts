/**
 * Node side of Render and convert / Save frame: picks output paths and runs
 * ffmpeg with progress and cancel.
 */
import { mp4Args, parseProgressLine, progressFraction } from "../core/ffmpeg";
import { safeFileName, uniqueFileName } from "../core/format";
import { logger } from "./logger";
import { node } from "./node";
import { defaultOutputFolder, ensureDir, resolveFfmpeg } from "./paths";

export function outputFolder(configured: string): string {
  const n = node();
  if (!n) throw new Error("File access needs After Effects (Node is not available in the browser).");
  return ensureDir(n, configured || defaultOutputFolder(n));
}

export function uniqueOutputPath(folder: string, baseName: string, ext: string): string {
  const n = node()!;
  const taken = n.fs.existsSync(folder) ? n.fs.readdirSync(folder) : [];
  return n.path.join(folder, uniqueFileName(safeFileName(baseName), ext, taken));
}

/** A temp base path (no extension) for the intermediate render. */
export function tempRenderBase(compName: string): string {
  const n = node();
  if (!n) throw new Error("Rendering needs After Effects.");
  const dir = ensureDir(n, n.path.join(n.os.tmpdir(), "MasterEditSuite"));
  return n.path.join(dir, `${safeFileName(compName)}-${Date.now()}`);
}

/** After Effects picks the extension; find the file it actually wrote. */
export function findRendered(reported: string | null, base: string): string | null {
  const n = node()!;
  if (reported && n.fs.existsSync(reported)) return reported;
  const dir = n.path.dirname(base);
  const stem = n.path.basename(base);
  const hit = n.fs.readdirSync(dir).find((f) => f.startsWith(stem));
  return hit ? n.path.join(dir, hit) : null;
}

export interface ConvertJob {
  promise: Promise<void>;
  cancel(): void;
}

export function convertToMp4(
  input: string,
  output: string,
  opts: { crf: number; width: number; height: number; duration: number; ffmpegPath: string },
  onProgress: (fraction: number) => void,
): ConvertJob {
  const n = node();
  if (!n) throw new Error("Converting needs After Effects.");
  const bin = resolveFfmpeg(opts.ffmpegPath);
  const args = mp4Args(input, output, opts);
  logger.info("ffmpeg start", { bin, args });
  const proc = n.childProcess.spawn(bin, args, { windowsHide: true });
  let cancelled = false;
  let stderr = "";
  let buffer = "";

  const promise = new Promise<void>((resolve, reject) => {
    proc.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = parseProgressLine(line);
        if (t !== null) onProgress(progressFraction(t, opts.duration));
      }
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    proc.on("error", (e: NodeJS.ErrnoException) => {
      reject(
        new Error(
          e.code === "ENOENT"
            ? "ffmpeg was not found. Put ffmpeg in the extension's bin folder or set its path in Settings."
            : `ffmpeg could not start: ${e.message}`,
        ),
      );
    });
    proc.on("close", (code: number | null) => {
      if (cancelled) {
        try {
          n.fs.rmSync(output, { force: true });
        } catch {
          // Leftover partial file; harmless.
        }
        reject(new Error("Cancelled"));
      } else if (code === 0) {
        onProgress(1);
        resolve();
      } else {
        logger.error("ffmpeg failed", { code, stderr });
        reject(new Error(`ffmpeg failed (exit code ${code}). Details are in the log.`));
      }
    });
  });
  return {
    promise,
    cancel() {
      cancelled = true;
      proc.kill();
    },
  };
}

export function removeQuietly(file: string): void {
  try {
    node()?.fs.rmSync(file, { force: true });
  } catch {
    // Temp file cleanup is best effort.
  }
}
