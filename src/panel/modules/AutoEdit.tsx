/** Auto Edit: turns the selected clips into a styled edit part in one run, undone by one Ctrl+Z. */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "../app/store";
import { callHost } from "../bridge/host";
import { Hint, Switch } from "../components/ui";
import {
  CUT_TYPES,
  EXTRA_TYPES,
  STEP_IDS,
  TRANSITION_IN_TYPES,
  buildRunArgs,
  bundledCatalog,
  effectiveStyle,
  nameOf,
  stepSummary,
  type Catalog,
  type EditPart,
  type Overrides,
  type StepId,
} from "../core/autoedit";
import { duration, plural } from "../core/format";
import { BUNDLED_RECIPES, mergeRecipes } from "../core/recipes";
import { needsComp } from "../core/requirements";
import { loadLibraryRecipes } from "../node/library";

const TITLES: Record<StepId, string> = {
  precompose: "Pre-compose",
  effects: "Effects, per clip",
  transitionIn: "Transition into edit",
  cuts: "Transitions at clip switches",
  extra: "Additional effect",
  cc: "Coloring (CC)",
};

function Chips({
  options,
  value,
  onChange,
  label,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  label: (id: string) => string;
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o} type="button" className={o === value ? "chip active" : "chip"} onClick={() => onChange(o)}>
          {label(o)}
        </button>
      ))}
    </div>
  );
}

function ToggleChip({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className={on ? "chip active" : "chip"} aria-pressed={on} onClick={() => onChange(!on)}>
      {on ? "✓ " : ""}
      {label}
    </button>
  );
}

export function AutoEdit() {
  const { state, run, settings, updateSettings, toast, setProgress } = useStore();
  const catalog: Catalog = useMemo(
    () => bundledCatalog(mergeRecipes(BUNDLED_RECIPES, loadLibraryRecipes(settings.libraryPath))),
    [settings.libraryPath],
  );
  const style = catalog.styles.find((s) => s.id === settings.autoEditStyle) ?? catalog.styles[0];
  const [overrides, setOverrides] = useState<Overrides>({});
  const [part, setPart] = useState<EditPart | null>(null);
  const [confirmRemap, setConfirmRemap] = useState(false);
  const s = useMemo(() => effectiveStyle(style, overrides, catalog), [style, overrides, catalog]);
  const comp = needsComp(state);

  const capture = useCallback(
    async (ids?: number[]) => {
      const r = await callHost<EditPart>("autoedit.inspect", { clipIds: ids ?? [] });
      if (r.ok) {
        setPart(r.result.clips ? r.result : null);
        if (!ids && !r.result.clips) toast({ kind: "info", message: "Select the clips of the edit part in the timeline first." });
        return r.result;
      }
      toast({ kind: "error", message: r.error.message });
      return null;
    },
    [toast],
  );

  // Pick up the selection once when the module opens with clips selected.
  useEffect(() => {
    if (!part && state?.comp && state.selection.some((l) => ["footage", "precomp", "still"].includes(l.kind))) void capture();
  }, [state?.comp?.id]);

  const set = (o: Overrides) => setOverrides((cur) => ({ ...cur, ...o }));
  const setStep = (id: StepId, on: boolean) => setOverrides((cur) => ({ ...cur, steps: { ...cur.steps, [id]: on } }));
  const remapNeedsConfirm = !!part?.timeRemapped.length && s.steps.effects && s.velocity.enabled;

  const runAutoEdit = async () => {
    if (!part) return;
    const fresh = await capture(part.ids);
    if (!fresh || !fresh.clips) return;
    const args = buildRunArgs(s, catalog, fresh.ids, {
      overwriteTimeRemap: confirmRemap,
      balance: { target: settings.balanceTarget, strength: settings.balanceStrength, tameBright: settings.balanceTame },
    });
    setProgress({ title: `Auto editing ${plural(fresh.clips, "clip")}… After Effects is busy until it finishes.`, fraction: null });
    const started = performance.now();
    try {
      const r = await run<{ clips: number; cuts: number; precomposed: number }>("autoedit.run", args, {
        success: (res) =>
          `Auto edit done in ${((performance.now() - started) / 1000).toFixed(1)} s: ${plural(res.clips, "clip")}, ${plural(res.cuts, "cut")}`,
      });
      // Clips may have become precomps: re-read the edit part from the (unchanged) selection.
      if (r.ok) await capture();
    } finally {
      setProgress(null);
    }
  };

  const rows: Record<StepId, ReactNode> = {
    precompose: null,
    effects: (
      <>
        <div className="chips">
          <ToggleChip on={s.velocity.enabled} label="Velocity" onChange={(v) => set({ velocity: v })} />
          <ToggleChip on={s.zoom.enabled} label="Zooms" onChange={(v) => set({ zoom: v })} />
          <ToggleChip on={s.shake.enabled} label="Shake" onChange={(v) => set({ shake: v })} />
        </div>
        <label className="field">
          <span className="field-label">Style for this step</span>
          <select
            className="select"
            value={overrides.effectsStyleId ?? ""}
            onChange={(e) => set({ effectsStyleId: e.target.value || undefined })}
          >
            <option value="">Same as above</option>
            {catalog.styles
              .filter((x) => x.id !== style.id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </label>
        {remapNeedsConfirm ? (
          <label className="option warning">
            <Switch label="Overwrite time remapping" checked={confirmRemap} onChange={setConfirmRemap} />
            <span>
              Overwrite time remapping on {part!.timeRemapped.join(", ")} (otherwise they keep it and get no velocity)
            </span>
          </label>
        ) : null}
      </>
    ),
    transitionIn: (
      <Chips
        options={TRANSITION_IN_TYPES}
        value={s.transitionIn.type}
        onChange={(v) => set({ transitionInType: v })}
        label={(id) => nameOf(id, catalog.transitions)}
      />
    ),
    cuts: (
      <Chips options={CUT_TYPES} value={s.cuts.type} onChange={(v) => set({ cutsType: v })} label={(id) => nameOf(id, catalog.transitions)} />
    ),
    extra: (
      <Chips options={EXTRA_TYPES} value={s.extra.type} onChange={(v) => set({ extraType: v })} label={(id) => nameOf(id, catalog.effects)} />
    ),
    cc: (
      <div className="chips">
        <ToggleChip on={s.cc.balance} label="Balance brightness first" onChange={(v) => set({ balance: v })} />
      </div>
    ),
  };

  const notices = part
    ? [
        part.shortClips.length ? `Shorter than 6 frames, no velocity or zooms: ${part.shortClips.join(", ")}` : null,
        part.stills.length ? `Still images, no velocity: ${part.stills.join(", ")}` : null,
        part.overlaps.length ? `Overlapping clips (processed anyway): ${part.overlaps.join(", ")}` : null,
        ...part.notes,
      ].filter((x): x is string => !!x)
    : [];

  const canRun = comp.enabled && !!part && part.clips > 0;

  return (
    <div className="autoedit">
      <div className="part">
        <div>
          <div className="part-title">{part ? `Edit part: ${plural(part.clips, "clip")} · ${duration(part.end - part.start)}` : "No edit part yet"}</div>
          <div className="muted small">
            {part ? part.names.join(", ") : comp.enabled ? "Select the clips in the timeline, then pick them up here." : comp.reason}
          </div>
        </div>
        <button type="button" className="action compact" disabled={!comp.enabled} onClick={() => void capture()}>
          <span className="action-label">Select new clips</span>
        </button>
      </div>
      {notices.map((n) => (
        <p key={n} className="warning">
          {n}
        </p>
      ))}

      <label className="field style-field">
        <span className="field-label">Style</span>
        <select
          className="select"
          value={style.id}
          onChange={(e) => {
            updateSettings({ autoEditStyle: e.target.value });
            setOverrides({});
          }}
        >
          {catalog.styles.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {style.description ? <Hint>{style.description}</Hint> : null}

      <ol className="steps">
        {STEP_IDS.map((id, i) => (
          <li key={id} className={s.steps[id] ? "step" : "step off"}>
            <div className="step-head">
              <span className="step-num">{i + 1}</span>
              <div className="step-text">
                <div className="step-title">{TITLES[id]}</div>
                <div className="muted small">{s.steps[id] ? stepSummary(id, s, part, catalog) : "Off: adds nothing"}</div>
              </div>
              <Switch label={TITLES[id]} checked={s.steps[id]} onChange={(on) => setStep(id, on)} />
            </div>
            {s.steps[id] && rows[id] ? <div className="step-body">{rows[id]}</div> : null}
          </li>
        ))}
      </ol>

      <div className="lib-footer">
        <button type="button" className="action primary run" disabled={!canRun} onClick={() => void runAutoEdit()}>
          <span className="action-label">{part ? `Auto edit ${plural(part.clips, "clip")}` : "Auto edit"}</span>
          <span className="action-sub">{canRun ? "One Ctrl+Z undoes the whole run" : comp.enabled ? "Select new clips first" : comp.reason}</span>
        </button>
      </div>
    </div>
  );
}
