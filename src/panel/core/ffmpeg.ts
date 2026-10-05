/** Pure helpers for the H.264 conversion step of Render and convert. */

export interface Mp4Options {
  crf: number;
  width: number;
  height: number;
}

/**
 * ffmpeg arguments for a high-quality, widely playable MP4. yuv420p needs even
 * dimensions, so odd comp sizes are padded by one pixel rather than scaled.
 */
export function mp4Args(input: string, output: string, opts: Mp4Options): string[] {
  const args = ["-hide_banner", "-y", "-i", input];
  if (opts.width % 2 || opts.height % 2) {
    args.push("-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2");
  }
  args.push(
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", String(opts.crf),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "320k",
    "-movflags", "+faststart",
    "-progress", "pipe:1",
    "-nostats",
    output,
  );
  return args;
}

/**
 * Reads `-progress pipe:1` output and returns the encoded time in seconds, or
 * null for lines that carry no time. ffmpeg reports out_time_us (and, despite the
 * name, out_time_ms) in microseconds.
 */
export function parseProgressLine(line: string): number | null {
  const m = /^out_time_(?:us|ms)=(\d+)/.exec(line.trim());
  if (m) return Number(m[1]) / 1e6;
  const t = /^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line.trim());
  if (t) return Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]);
  return null;
}

export function progressFraction(seconds: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(1, seconds / total));
}
