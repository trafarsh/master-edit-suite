/** Settings and diagnostics. Everything here persists in the local settings file. */
import { useEffect, useState } from "react";
import { useStore } from "../app/store";
import { isCep } from "../bridge/cep";
import { callHost } from "../bridge/host";
import type { PingResult } from "../bridge/types";
import { Icon } from "../components/Icons";
import { Hint, NumberField, Section, TextField } from "../components/ui";
import { DEFAULT_SETTINGS } from "../core/settings";
import { logDir, recentLog } from "../node/logger";
import { node } from "../node/node";
import { defaultOutputFolder, openFolder } from "../node/paths";
import { settingsFilePath } from "../node/settingsStore";

declare const __APP_VERSION__: string;

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // CEP's Chromium may block the async clipboard; fall back to execCommand.
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export function SettingsModule() {
  const { settings, updateSettings, toast, state } = useStore();
  const [ping, setPing] = useState<PingResult | null>(null);
  const n = node();

  useEffect(() => {
    void callHost<PingResult>("host.ping").then((r) => r.ok && setPing(r.result));
  }, []);

  const diagnostics = () => {
    const { easePresets: _presets, ...shareable } = settings;
    return [
      `Master Edit Suite ${__APP_VERSION__}`,
      `After Effects: ${ping ? `${ping.aeVersion} (${ping.language}), host ${ping.hostVersion}` : "not connected"}`,
      `OS: ${ping?.os ?? navigator.userAgent}`,
      `Runtime: ${isCep() ? "CEP" : "browser preview"}, Node ${n ? "available" : "unavailable"}`,
      `Comp: ${state?.comp ? `${state.comp.width}x${state.comp.height} @ ${state.comp.frameRate} fps, ${state.comp.numLayers} layers` : "none"}`,
      `Settings: ${JSON.stringify(shareable)}`,
      "",
      "Recent log:",
      ...recentLog().slice(-80),
    ].join("\n");
  };

  return (
    <>
      <Section title="Folders">
        <TextField
          label="Library folder"
          value={settings.libraryPath}
          placeholder="e.g. D:\\Editing\\Library"
          onChange={(v) => updateSettings({ libraryPath: v.trim() })}
        />
        <TextField
          label="Output folder"
          value={settings.outputFolder}
          placeholder={n ? defaultOutputFolder(n) : "Videos/Master Edit Suite"}
          onChange={(v) => updateSettings({ outputFolder: v.trim() })}
        />
        <TextField
          label="ffmpeg"
          value={settings.ffmpegPath}
          placeholder="Bundled bin/ffmpeg, then PATH"
          onChange={(v) => updateSettings({ ffmpegPath: v.trim() })}
        />
      </Section>
      <Section title="Export">
        <TextField
          label="Render template"
          value={settings.renderTemplate}
          placeholder={DEFAULT_SETTINGS.renderTemplate}
          onChange={(v) => updateSettings({ renderTemplate: v.trim() || DEFAULT_SETTINGS.renderTemplate })}
        />
        <NumberField label="MP4 quality (CRF)" min={0} max={51} value={settings.mp4Crf} onChange={(v) => updateSettings({ mp4Crf: Math.round(v) })} />
        <Hint>Lower CRF means higher quality and bigger files; 18 is visually lossless for most edits.</Hint>
      </Section>
      <Section title="Audio and timing">
        <NumberField label="Fade length" suffix="s" step={0.1} min={0.01} max={30} value={settings.fadeSeconds} onChange={(v) => updateSettings({ fadeSeconds: v })} />
        <NumberField label="Fade floor" suffix="dB" min={-96} max={-6} value={settings.fadeFloorDb} onChange={(v) => updateSettings({ fadeFloorDb: v })} />
        <NumberField label="Volume step" suffix="dB" step={0.5} min={0.1} max={24} value={settings.volumeStepDb} onChange={(v) => updateSettings({ volumeStepDb: v })} />
        <NumberField label="Selection refresh" suffix="ms" step={250} min={250} max={10000} value={settings.pollMs} onChange={(v) => updateSettings({ pollMs: Math.round(v) })} />
      </Section>
      <Section title="Diagnostics">
        <div className="grid">
          <button
            type="button"
            className="action"
            onClick={async () => {
              await copyText(diagnostics());
              toast({ kind: "success", message: "Diagnostics copied to the clipboard" });
            }}
          >
            <span className="action-label">Copy diagnostics</span>
            <span className="action-sub">For bug reports</span>
          </button>
          <button
            type="button"
            className="action"
            disabled={!n}
            onClick={() => {
              const dir = logDir();
              if (dir) openFolder(dir);
            }}
          >
            <span className="action-label">
              <Icon.folder /> Open log folder
            </span>
            <span className="action-sub">{n ? "Rotating local log" : "Needs After Effects"}</span>
          </button>
        </div>
        <Hint>
          No telemetry: logs and settings stay on this machine
          {settingsFilePath() ? ` (${settingsFilePath()})` : ""}.
        </Hint>
        <button
          type="button"
          className="link small danger"
          onClick={() => {
            const { libraryPath, outputFolder, ffmpegPath, easePresets } = settings;
            updateSettings({ ...DEFAULT_SETTINGS, libraryPath, outputFolder, ffmpegPath, easePresets });
            toast({ kind: "info", message: "Tool defaults restored (folders and saved curves kept)" });
          }}
        >
          Reset tool defaults
        </button>
      </Section>
    </>
  );
}
