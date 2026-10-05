import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/panel/core/settings";

describe("normalizeSettings", () => {
  it("returns defaults for missing or broken input", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values and clamps out-of-range numbers", () => {
    const s = normalizeSettings({ fadeSeconds: 2, volumeStepDb: 99, pollMs: 10, mp4Crf: 20.6, libraryPath: "  D:\\Lib  " });
    expect(s.fadeSeconds).toBe(2);
    expect(s.volumeStepDb).toBe(24);
    expect(s.pollMs).toBe(250);
    expect(s.mp4Crf).toBe(21);
    expect(s.libraryPath).toBe("D:\\Lib");
  });

  it("drops unknown keys and wrong types", () => {
    const s = normalizeSettings({ fadeSeconds: "3", resizeMode: "stretch", apiKey: "secret", easePresets: [{ name: "x", points: [0, 0, 1] }] });
    expect(s.fadeSeconds).toBe(DEFAULT_SETTINGS.fadeSeconds);
    expect(s.resizeMode).toBe("fit");
    expect("apiKey" in s).toBe(false);
    expect(s.easePresets).toEqual([]);
  });

  it("keeps well-formed ease presets", () => {
    const preset = { name: "Snappy", points: [0.7, 0, 0.2, 1] };
    expect(normalizeSettings({ easePresets: [preset] }).easePresets).toEqual([preset]);
  });

  it("never shares the default ease preset array", () => {
    const a = normalizeSettings(null);
    a.easePresets.push({ name: "x", points: [0, 0, 1, 1] });
    expect(DEFAULT_SETTINGS.easePresets).toEqual([]);
  });
});
