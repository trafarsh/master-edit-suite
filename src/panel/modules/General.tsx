/** General: one-click fixes for arranging layers, audio, colour and cuts. */
import { useState } from "react";
import { useStore } from "../app/store";
import { ActionButton, Hint, NumberField, Planned, Section, Switch, Tabs } from "../components/ui";
import { plural } from "../core/format";
import { needsComp, needsLayers, needsSceneClip, rules, type Availability } from "../core/requirements";

type Tab = "arrange" | "audio" | "color" | "cuts";

export function General() {
  const [tab, setTab] = useState<Tab>("arrange");
  return (
    <>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "arrange", label: "Arrange" },
          { id: "audio", label: "Audio" },
          { id: "color", label: "Color" },
          { id: "cuts", label: "Cuts" },
        ]}
      />
      {tab === "arrange" && <Arrange />}
      {tab === "audio" && <Audio />}
      {tab === "color" && <Color />}
      {tab === "cuts" && <Cuts />}
    </>
  );
}

const UNDEFINED_BEHAVIOUR: Availability = {
  enabled: false,
  target: "",
  reason: "Behaviour not defined yet (open question in the PRD)",
  layers: [],
};

function Arrange() {
  const { state, run, settings, updateSettings } = useStore();
  return (
    <>
      <Section title="Timing">
        <div className="grid">
          <ActionButton
            label="Move to playhead"
            avail={needsLayers(state, rules.anyLayer)}
            onClick={() => run("arrange.moveToPlayhead", {}, { success: (r) => `Moved ${plural(r.moved, "layer")}` })}
          />
          <ActionButton
            label="Staircase layers"
            avail={needsLayers(state, rules.twoLayers)}
            onClick={() =>
              run(
                "arrange.staircase",
                { overlapFrames: settings.staircaseOverlapFrames },
                { success: (r) => `Sequenced ${plural(r.arranged, "layer")}` },
              )
            }
          />
        </div>
        <NumberField
          label="Staircase overlap"
          suffix="frames"
          min={0}
          max={600}
          value={settings.staircaseOverlapFrames}
          onChange={(v) => updateSettings({ staircaseOverlapFrames: Math.round(v) })}
        />
        <Hint>Staircase follows selection order: click layers in the order they should play.</Hint>
      </Section>
      <Section title="Comps">
        <div className="grid">
          <ActionButton
            label="Pre-compose each"
            avail={needsLayers(state, rules.precomposable)}
            onClick={() =>
              run("arrange.precomposeEach", {}, { success: (r) => `Pre-composed ${plural(r.precomposed, "layer")}` })
            }
          />
          <ActionButton
            label="Un-precompose"
            avail={needsLayers(state, rules.precomp)}
            onClick={() =>
              run("arrange.unprecompose", {}, { success: (r) => `Un-precomposed ${plural(r.unprecomposed, "layer")}` })
            }
          />
          <ActionButton
            label="Duplicate comp (independent)"
            avail={needsComp(state)}
            onClick={() =>
              run(
                "arrange.duplicateComp",
                {},
                { success: (r) => `Created ${r.name} with ${plural(r.duplicated - 1, "nested copy", "nested copies")}` },
              )
            }
          />
        </div>
      </Section>
      <Section title="Text and frames">
        <div className="grid">
          <ActionButton
            label="Split text by word"
            avail={needsLayers(state, rules.text)}
            onClick={() => run("arrange.splitTextByWord", {}, { success: (r) => `Created ${plural(r.words, "word layer")}` })}
          />
          <ActionButton label="Fix frame-blend edges" avail={UNDEFINED_BEHAVIOUR} onClick={() => undefined} />
        </div>
      </Section>
    </>
  );
}

function Audio() {
  const { state, run, settings, updateSettings } = useStore();
  const audio = needsLayers(state, rules.audio);
  const fade = (mode: "in" | "both" | "out") =>
    run(
      "audio.fade",
      { mode, seconds: settings.fadeSeconds, floorDb: settings.fadeFloorDb },
      { success: (r) => `Faded ${plural(r.layers, "layer")}` },
    );
  const volume = (db: number) =>
    run("audio.volume", { db }, { success: (r) => `${db > 0 ? "+" : ""}${r.db} dB on ${plural(r.layers, "layer")}` });
  return (
    <>
      <Section title="Fades">
        <div className="grid three">
          <ActionButton label="Fade in" avail={audio} onClick={() => fade("in")} />
          <ActionButton label="Both" avail={audio} onClick={() => fade("both")} />
          <ActionButton label="Fade out" avail={audio} onClick={() => fade("out")} />
        </div>
        <NumberField
          label="Fade length"
          suffix="s"
          step={0.1}
          min={0.01}
          max={30}
          value={settings.fadeSeconds}
          onChange={(v) => updateSettings({ fadeSeconds: v })}
        />
      </Section>
      <Section title="Volume">
        <div className="grid">
          <ActionButton
            label={`Volume −${settings.volumeStepDb} dB`}
            avail={audio}
            onClick={() => volume(-settings.volumeStepDb)}
          />
          <ActionButton
            label={`Volume +${settings.volumeStepDb} dB`}
            avail={audio}
            onClick={() => volume(settings.volumeStepDb)}
          />
        </div>
        <NumberField
          label="Volume step"
          suffix="dB"
          step={0.5}
          min={0.1}
          max={24}
          value={settings.volumeStepDb}
          onChange={(v) => updateSettings({ volumeStepDb: v })}
        />
        <Hint>Existing Audio Levels keyframes are shifted too, so the mix shape is kept.</Hint>
      </Section>
      <Section title="Reverb">
        <Planned phase={2} items={["Advanced reverb: built-in Reverb effect with a tuned preset (P2)"]} />
      </Section>
    </>
  );
}

function Cuts() {
  const { state, run, setProgress } = useStore();
  const clip = needsSceneClip(state);
  // Scene detection analyses the whole clip and blocks After Effects while it runs.
  const detect = async (action: string, success: (r: any) => string) => {
    setProgress({ title: `Detecting cuts in ${clip.target}… After Effects is busy until it finishes.`, fraction: null });
    try {
      await run(action, {}, { success });
    } finally {
      setProgress(null);
    }
  };
  return (
    <Section title="Scene edits">
      <div className="grid">
        <ActionButton
          label="Detect cuts"
          avail={clip}
          onClick={() => detect("cuts.detect", (r) => (r.cuts ? `Marked ${plural(r.cuts, "cut")}` : "No cuts found"))}
        />
        <ActionButton
          label="Split at cuts"
          avail={clip}
          onClick={() => detect("cuts.split", (r) => `Split into ${plural(r.shots, "shot")}`)}
        />
        <ActionButton
          label="Adjustment layer per cut"
          avail={clip}
          onClick={() => detect("cuts.adjustmentPerCut", (r) => `Added ${plural(r.shots, "adjustment layer")}`)}
        />
      </div>
      <Hint>Uses After Effects' own scene edit detection. Detect cuts adds a layer marker at each cut.</Hint>
    </Section>
  );
}

function Color() {
  const { state, run, settings, updateSettings, setProgress } = useStore();
  const clips = needsLayers(state, rules.clips);
  return (
    <Section title="Balance brightness">
      <NumberField
        label="Brightness target"
        suffix="1–10"
        min={1}
        max={10}
        step={0.5}
        value={settings.balanceTarget}
        onChange={(v) => updateSettings({ balanceTarget: v })}
      />
      <label className="field">
        <span className="field-label">Strength</span>
        <span className="field-input">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(settings.balanceStrength * 100)}
            onChange={(e) => updateSettings({ balanceStrength: Number(e.target.value) / 100 })}
          />
          <span className="suffix range-value">{Math.round(settings.balanceStrength * 100)}%</span>
        </span>
      </label>
      <label className="option">
        <Switch label="Also tame over-bright clips" checked={settings.balanceTame} onChange={(v) => updateSettings({ balanceTame: v })} />
        <span>Also tame over-bright clips</span>
      </label>
      <ActionButton
        label={clips.enabled ? `Balance brightness · ${clips.target}` : "Balance brightness"}
        primary
        avail={{ ...clips, target: clips.enabled ? "One Exposure effect per clip" : "" }}
        onClick={async () => {
          setProgress({ title: `Measuring ${clips.target}…`, fraction: null });
          try {
            await run(
              "color.balance",
              { target: settings.balanceTarget, strength: settings.balanceStrength, tameBright: settings.balanceTame },
              {
                success: (r) =>
                  `Balanced ${plural(r.clips, "clip")}: ${r.results.map((x: { stops: number }) => `${x.stops > 0 ? "+" : ""}${x.stops}`).join(", ")} stops`,
              },
            );
          } finally {
            setProgress(null);
          }
        }}
      />
      <Hint>
        With the option off, clips are only brightened, never darkened. Running it again replaces the earlier balance instead of
        stacking.
      </Hint>
    </Section>
  );
}
