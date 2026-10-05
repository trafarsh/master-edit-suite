import { describe, expect, it } from "vitest";
import { mp4Args, parseProgressLine, progressFraction } from "../../src/panel/core/ffmpeg";
import { plural, safeFileName, timecode, uniqueFileName } from "../../src/panel/core/format";
import { themeVars } from "../../src/panel/app/theme";

describe("format", () => {
  it("pluralises", () => {
    expect(plural(1, "layer")).toBe("1 layer");
    expect(plural(3, "layer")).toBe("3 layers");
    expect(plural(2, "nested copy", "nested copies")).toBe("2 nested copies");
  });

  it("formats timecode with frames", () => {
    expect(timecode(4.2, 30)).toBe("0:00:04:06");
    expect(timecode(3661, 25)).toBe("1:01:01:00");
    expect(timecode(1, 29.97)).toBe("0:00:01:00");
  });

  it("makes file names safe on Windows and macOS", () => {
    expect(safeFileName('Edit: "final" v2?')).toBe("Edit_ _final_ v2_");
    expect(safeFileName("CON")).toBe("untitled");
    expect(safeFileName("name. ")).toBe("name");
  });

  it("never overwrites an existing output", () => {
    expect(uniqueFileName("Edit", "mp4", [])).toBe("Edit.mp4");
    expect(uniqueFileName("Edit", "mp4", ["edit.MP4", "Edit (2).mp4"])).toBe("Edit (3).mp4");
  });
});

describe("ffmpeg", () => {
  it("builds H.264 arguments and pads odd sizes", () => {
    const even = mp4Args("in.avi", "out.mp4", { crf: 18, width: 1080, height: 1920 });
    expect(even).toContain("libx264");
    expect(even).not.toContain("-vf");
    expect(even.at(-1)).toBe("out.mp4");
    const odd = mp4Args("in.avi", "out.mp4", { crf: 18, width: 1081, height: 1920 });
    expect(odd[odd.indexOf("-vf") + 1]).toBe("pad=ceil(iw/2)*2:ceil(ih/2)*2");
  });

  it("parses progress lines", () => {
    expect(parseProgressLine("out_time_us=2500000")).toBe(2.5);
    expect(parseProgressLine("out_time_ms=2500000")).toBe(2.5);
    expect(parseProgressLine("out_time=00:01:02.500000")).toBeCloseTo(62.5);
    expect(parseProgressLine("frame=12")).toBeNull();
    expect(progressFraction(15, 10)).toBe(1);
    expect(progressFraction(5, 0)).toBe(0);
  });
});

describe("theme", () => {
  it("derives light text on dark After Effects backgrounds and vice versa", () => {
    expect(themeVars({ red: 35, green: 35, blue: 35 })["--text"]).toBe("rgb(228, 228, 228)");
    expect(themeVars({ red: 200, green: 200, blue: 200 })["--text"]).toBe("rgb(25, 25, 25)");
    expect(themeVars({ red: 35, green: 35, blue: 35 })["--bg"]).toBe("rgb(35, 35, 35)");
  });
});
