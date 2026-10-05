/** Project: export, sizing and keeping the project file clean. */
import { useEffect, useState } from "react";
import { useStore } from "../app/store";
import { Icon } from "../components/Icons";
import { ActionButton, Hint, NumberField, Section, Segmented } from "../components/ui";
import { plural, timecode } from "../core/format";
import { needsComp, needsLayers, needsProject, rules } from "../core/requirements";
import {
  convertToMp4,
  findRendered,
  outputFolder,
  removeQuietly,
  tempRenderBase,
  uniqueOutputPath,
  type ConvertJob,
} from "../node/convert";
import { node } from "../node/node";
import { openFolder } from "../node/paths";

const SIZE_PRESETS = [
  { label: "9:16", w: 1080, h: 1920 },
  { label: "16:9", w: 1920, h: 1080 },
  { label: "1:1", w: 1080, h: 1080 },
];

export function Project() {
  return (
    <>
      <Export />
      <Size />
      <Bin />
    </>
  );
}

function Export() {
  const { state, run, settings, toast, setProgress } = useStore();
  const [lastFolder, setLastFolder] = useState<string | null>(null);
  const comp = needsComp(state);
  const fileAccess = node()
    ? comp
    : { ...comp, enabled: false, reason: "Needs After Effects (file access is unavailable in the browser preview)" };

  const renderAndConvert = async () => {
    const c = state?.comp;
    if (!c) return;
    let base: string;
    let out: string;
    try {
      base = tempRenderBase(c.name);
      out = uniqueOutputPath(outputFolder(settings.outputFolder), c.name, "mp4");
    } catch (e) {
      toast({ kind: "error", message: (e as Error).message });
      return;
    }
    setProgress({ title: `Rendering ${c.name}… After Effects is busy until the render finishes.`, fraction: null });
    const r = await run<{ file: string | null; template: string }>(
      "project.render",
      { basePath: base, template: settings.renderTemplate },
      { quiet: true },
    );
    if (!r.ok) {
      setProgress(null);
      return;
    }
    const rendered = findRendered(r.result.file, base);
    if (!rendered) {
      setProgress(null);
      toast({ kind: "error", message: "The render finished but its file could not be found." });
      return;
    }
    let job: ConvertJob | null = null;
    const cancel = () => job?.cancel();
    setProgress({ title: "Converting to MP4", fraction: 0, onCancel: cancel });
    try {
      job = convertToMp4(
        rendered,
        out,
        { crf: settings.mp4Crf, width: c.width, height: c.height, duration: c.duration, ffmpegPath: settings.ffmpegPath },
        (fraction) => setProgress({ title: "Converting to MP4", fraction, onCancel: cancel }),
      );
      await job.promise;
      const n = node()!;
      setLastFolder(n.path.dirname(out));
      toast({ kind: "success", message: `Saved ${n.path.basename(out)}` });
    } catch (e) {
      const msg = (e as Error).message;
      toast(msg === "Cancelled" ? { kind: "info", message: "Conversion cancelled; nothing was saved." } : { kind: "error", message: msg });
    } finally {
      setProgress(null);
      removeQuietly(rendered);
    }
  };

  const saveFrame = async () => {
    const c = state?.comp;
    if (!c) return;
    let path: string;
    try {
      path = uniqueOutputPath(outputFolder(settings.outputFolder), `${c.name} ${timecode(c.time, c.frameRate).replace(/:/g, "-")}`, "png");
    } catch (e) {
      toast({ kind: "error", message: (e as Error).message });
      return;
    }
    const r = await run("project.saveFramePng", { path }, { success: () => `Saved ${node()?.path.basename(path) ?? path}` });
    if (r.ok) setLastFolder(node()?.path.dirname(path) ?? null);
  };

  return (
    <Section
      title="Export"
      aside={
        lastFolder ? (
          <button type="button" className="link small" onClick={() => openFolder(lastFolder)}>
            <Icon.folder /> Open folder
          </button>
        ) : null
      }
    >
      <div className="grid">
        <ActionButton label="Render and convert" avail={fileAccess} onClick={renderAndConvert} primary />
        <ActionButton label="Save frame as PNG" avail={fileAccess} onClick={saveFrame} />
      </div>
      <Hint>Writes H.264 MP4 and PNG files to the output folder set in Settings.</Hint>
    </Section>
  );
}

function Size() {
  const { state, run, settings, updateSettings } = useStore();
  const c = state?.comp;
  const [w, setW] = useState(c?.width ?? 1080);
  const [h, setH] = useState(c?.height ?? 1920);
  // The size fields follow the active comp's size until the user edits them.
  useEffect(() => {
    if (c) {
      setW(c.width);
      setH(c.height);
    }
  }, [c?.id, c?.width, c?.height]);

  const comp = needsComp(state);
  const sameSize = c && c.width === w && c.height === h;
  return (
    <Section title="Size">
      <div className="row">
        <NumberField label="Width" suffix="px" min={4} max={30000} value={w} onChange={(v) => setW(Math.round(v))} />
        <NumberField label="Height" suffix="px" min={4} max={30000} value={h} onChange={(v) => setH(Math.round(v))} />
      </div>
      <div className="chips">
        {SIZE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={w === p.w && h === p.h ? "chip active" : "chip"}
            onClick={() => {
              setW(p.w);
              setH(p.h);
            }}
          >
            {p.label} · {p.w}×{p.h}
          </button>
        ))}
      </div>
      <Segmented
        value={settings.resizeMode}
        onChange={(v) => updateSettings({ resizeMode: v })}
        options={[
          { id: "fit", label: "Fit inside" },
          { id: "fill", label: "Fill frame" },
        ]}
      />
      <div className="grid">
        <ActionButton
          label="Resize and center"
          avail={needsLayers(state, rules.visual)}
          onClick={() =>
            run(
              "project.resizeLayers",
              { width: w, height: h, mode: settings.resizeMode },
              { success: (r) => `Resized ${plural(r.resized, "layer")}` },
            )
          }
        />
        <ActionButton
          label="Reframe comp to size"
          avail={sameSize ? { ...comp, enabled: false, reason: `Comp is already ${w}×${h}` } : comp}
          onClick={() =>
            run("project.reframeComp", { width: w, height: h }, { success: (r) => `Comp is now ${r.width}×${r.height}` })
          }
        />
      </div>
    </Section>
  );
}

function Bin() {
  const { state, run } = useStore();
  const project = needsProject(state);
  return (
    <Section title="Project">
      <div className="grid">
        <ActionButton
          label="Tidy project bin"
          avail={project}
          onClick={() =>
            run("project.tidyBin", {}, { success: (r) => (r.moved ? `Moved ${plural(r.moved, "item")} into folders` : "Bin is already tidy") })
          }
        />
        <ActionButton
          label="Purge memory"
          avail={project}
          onClick={() => run("project.purge", {}, { success: () => "Cleared After Effects' caches" })}
        />
      </div>
      <Hint>Tidy only moves root-level items into Comps, Precomps, Footage, Audio, Images and Solids; it never deletes or renames.</Hint>
    </Section>
  );
}
