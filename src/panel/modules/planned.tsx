/** Modules scheduled for later phases. Each lists exactly what the PRD commits to. */
import { Planned } from "../components/ui";

export function AutoEdit() {
  return (
    <Planned
      phase={3}
      note="Turns the selected clips into a styled edit part in one run, undone by one Ctrl+Z."
      items={[
        "Pre-compose each clip (reuses General › Arrange › Pre-compose each)",
        "Effects per clip: velocity ramp, zooms, shake with mirrored edges",
        "Transition into the edit, transitions at every clip switch",
        "Additional effect over the edit part, then coloring (CC)",
        "Styles as JSON files; re-runs replace earlier output",
      ]}
    />
  );
}

export function AiTools() {
  return (
    <Planned
      phase={4}
      note="Run in the background and drop results straight into the timeline."
      items={["Auto Captions (first)", "Dialogue isolation", "Sound effects generator", "Auto Tracker"]}
    />
  );
}

export function Transitions() {
  return (
    <Planned
      phase={2}
      note="Park the playhead on a cut and add a finished transition in one click."
      items={[
        "Shake flash, Zoom into edit, Smooth parallel, Warp flash, Hyperlapse, Glitch plus shake, Glitch",
        "Adjustment layers with built-in effects only, centred on the playhead",
        "Recipe files, so new bundles need no code change",
      ]}
    />
  );
}
