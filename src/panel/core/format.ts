/** Small pure formatting helpers. */

export function plural(n: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : pluralNoun}`;
}

/** Seconds -> "0:04:12" style timecode at the given frame rate (frames last). */
export function timecode(seconds: number, fps: number): string {
  const rate = Math.round(fps) || 30;
  const totalFrames = Math.round(seconds * fps);
  const sign = totalFrames < 0 ? "-" : "";
  const abs = Math.abs(totalFrames);
  const frames = abs % rate;
  const totalSecs = Math.floor(abs / rate);
  const s = totalSecs % 60;
  const m = Math.floor(totalSecs / 60) % 60;
  const h = Math.floor(totalSecs / 3600);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${sign}${h}:${pad(m)}:${pad(s)}:${pad(frames)}`;
}

export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")} min`;
}

/** Makes a string safe as a file name on Windows and macOS. */
export function safeFileName(name: string, fallback = "untitled"): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/, "")
    .trim();
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (!cleaned || reserved.test(cleaned)) return fallback;
  return cleaned.slice(0, 120);
}

/** "name.ext", "name (2).ext", ... — the first not in `taken` (case-insensitive). */
export function uniqueFileName(base: string, ext: string, taken: Iterable<string>): string {
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  let candidate = `${base}.${ext}`;
  for (let i = 2; lower.has(candidate.toLowerCase()); i++) candidate = `${base} (${i}).${ext}`;
  return candidate;
}
