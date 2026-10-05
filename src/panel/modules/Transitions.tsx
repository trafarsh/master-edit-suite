/** One-click transitions: park the playhead on a cut and click a bundle. */
import { useMemo, useState } from "react";
import { useStore } from "../app/store";
import { ActionButton, Hint, NumberField, Section } from "../components/ui";
import { timecode } from "../core/format";
import { BUNDLED_RECIPES, mergeRecipes, type Recipe } from "../core/recipes";
import { needsComp, type Availability } from "../core/requirements";
import { fileUrl, loadLibraryRecipes } from "../node/library";
import { node } from "../node/node";

const WATERMARK: Availability = {
  enabled: false,
  target: "",
  reason: "Overlay, not a transition; waiting on the PRD's open question",
  layers: [],
};

function previewFor(recipe: Recipe, libraryPath: string): string | null {
  const n = node();
  if (!n || !libraryPath) return null;
  for (const ext of ["webm", "mp4"]) {
    const p = n.path.join(libraryPath, "transitions", "previews", `${recipe.id}.${ext}`);
    if (n.fs.existsSync(p)) return fileUrl(p);
  }
  return null;
}

export function Transitions() {
  const { state, run, settings, updateSettings } = useStore();
  const [hovered, setHovered] = useState<Recipe | null>(null);
  const recipes = useMemo(() => mergeRecipes(BUNDLED_RECIPES, loadLibraryRecipes(settings.libraryPath)), [settings.libraryPath]);
  const comp = needsComp(state);
  const at: Availability = comp.enabled && state?.comp ? { ...comp, target: `at ${timecode(state.comp.time, state.comp.frameRate)}` } : comp;
  const preview = hovered ? previewFor(hovered, settings.libraryPath) : null;

  return (
    <>
      <div className="lib-preview transition-preview">
        {preview ? (
          <video src={preview} autoPlay loop muted playsInline />
        ) : (
          <span className="muted small">{hovered ? hovered.notes ?? hovered.name : "Hover a transition to preview it"}</span>
        )}
      </div>
      <Section title="Bundles">
        <div className="grid">
          {recipes.map((r) => (
            <div key={r.id} onMouseEnter={() => setHovered(r)} onMouseLeave={() => setHovered(null)}>
              <ActionButton
                label={r.name}
                avail={at}
                onClick={() =>
                  run(
                    "transitions.apply",
                    {
                      recipe: r,
                      lengthFrames: settings.transitionFrames || r.lengthFrames,
                      intensity: settings.transitionIntensity,
                    },
                    { success: () => `Added ${r.name}` },
                  )
                }
              />
            </div>
          ))}
          <ActionButton label="Watermark" avail={WATERMARK} onClick={() => undefined} />
        </div>
        <Hint>Each transition is centred on the playhead and built only from After Effects' own effects.</Hint>
      </Section>
      <Section title="Shared controls">
        <NumberField
          label="Length"
          suffix={settings.transitionFrames ? "frames" : "frames (recipe default)"}
          min={0}
          max={240}
          value={settings.transitionFrames}
          onChange={(v) => updateSettings({ transitionFrames: Math.round(v) })}
        />
        <label className="field">
          <span className="field-label">Intensity</span>
          <span className="field-input">
            <input
              type="range"
              min={25}
              max={200}
              step={5}
              value={Math.round(settings.transitionIntensity * 100)}
              onChange={(e) => updateSettings({ transitionIntensity: Number(e.target.value) / 100 })}
            />
            <span className="suffix range-value">{Math.round(settings.transitionIntensity * 100)}%</span>
          </span>
        </label>
        <Hint>Length 0 uses each transition's own length.</Hint>
      </Section>
    </>
  );
}
