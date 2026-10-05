/** Modules scheduled for later phases. Each lists exactly what the PRD commits to. */
import { Planned } from "../components/ui";

export function AiTools() {
  return (
    <Planned
      phase={4}
      note="Run in the background and drop results straight into the timeline."
      items={["Auto Captions (first)", "Dialogue isolation", "Sound effects generator", "Auto Tracker"]}
    />
  );
}
