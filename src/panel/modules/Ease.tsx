/** Ease: shape keyframe timing on a cubic-bezier curve and apply it in one click. */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useStore } from "../app/store";
import { ActionButton, Hint, Section, Switch } from "../components/ui";
import {
  DEFAULT_EASE_PRESETS,
  OVERSHOOT_RANGE,
  clampCurve,
  cssBezier,
  hasOvershoot,
  round2,
  sameCurve,
  type Curve,
} from "../core/ease";
import { plural } from "../core/format";
import { needsComp, type Availability } from "../core/requirements";

const SIZE = 220;
const PAD = 14;

/** Graph mapping; the y range widens to -0.5..1.5 when overshoot is on so handles stay visible. */
function graph(overshoot: boolean) {
  const [yMin, yMax] = overshoot ? OVERSHOOT_RANGE : [-0.06, 1.06];
  const span = SIZE - 2 * PAD;
  return {
    toPx: (x: number, y: number): [number, number] => [PAD + x * span, PAD + ((yMax - y) / (yMax - yMin)) * span],
    fromPx: (px: number, py: number): [number, number] => [(px - PAD) / span, yMax - ((py - PAD) / span) * (yMax - yMin)],
  };
}

export function Ease() {
  const { state, run, settings, updateSettings, toast } = useStore();
  const [curve, setCurve] = useState<Curve>([0.42, 0, 0.58, 1]);
  const [overshoot, setOvershoot] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [presetName, setPresetName] = useState("");
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<0 | 1 | null>(null);

  const comp = needsComp(state);
  const keys = state?.keys ?? { properties: 0, pairs: 0 };
  const keyAvail: Availability = !comp.enabled
    ? comp
    : keys.pairs > 0
      ? { enabled: true, target: `${plural(keys.pairs, "keyframe pair")} on ${plural(keys.properties, "property", "properties")}`, layers: [] }
      : { enabled: false, target: "", reason: "Select at least two keyframes on a property", layers: [] };

  const { toPx, fromPx } = graph(overshoot);
  const update = (c: Curve) => setCurve(round2(clampCurve(c, overshoot)));

  const onPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (dragging.current === null || !svg.current) return;
    const rect = svg.current.getBoundingClientRect();
    const scale = SIZE / rect.width;
    const [x, y] = fromPx((e.clientX - rect.left) * scale, (e.clientY - rect.top) * scale);
    const next: Curve = [...curve];
    next[dragging.current * 2] = x;
    next[dragging.current * 2 + 1] = y;
    update(next);
  };

  const [p0, p3] = [toPx(0, 0), toPx(1, 1)];
  const h1 = toPx(curve[0], curve[1]);
  const h2 = toPx(curve[2], curve[3]);
  const custom = settings.easePresets;

  return (
    <>
      <Section title="Curve">
        <svg
          ref={svg}
          className="ease-graph"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          onPointerMove={onPointer}
          onPointerUp={() => {
            dragging.current = null;
            setPreviewKey((k) => k + 1);
          }}
          onPointerLeave={() => (dragging.current = null)}
        >
          <rect x={p0[0]} y={p3[1]} width={p3[0] - p0[0]} height={p0[1] - p3[1]} className="ease-frame" />
          <line x1={p0[0]} y1={p0[1]} x2={p3[0]} y2={p3[1]} className="ease-diagonal" />
          <line x1={p0[0]} y1={p0[1]} x2={h1[0]} y2={h1[1]} className="ease-arm" />
          <line x1={p3[0]} y1={p3[1]} x2={h2[0]} y2={h2[1]} className="ease-arm" />
          <path
            d={`M${p0[0]},${p0[1]} C${h1[0]},${h1[1]} ${h2[0]},${h2[1]} ${p3[0]},${p3[1]}`}
            className="ease-curve"
          />
          {[h1, h2].map(([cx, cy], i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={7}
              className="ease-handle"
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                dragging.current = i as 0 | 1;
              }}
            />
          ))}
        </svg>
        <div className="ease-preview" key={previewKey} title="Preview">
          <span className="ease-dot" style={{ animationTimingFunction: cssBezier(curve) }} />
        </div>
        <div className="ease-values">
          <code>{round2(curve).join(", ")}</code>
          <label className="inline-switch">
            <span className="muted">Overshoot</span>
            <Switch
              label="Overshoot"
              checked={overshoot}
              onChange={(on) => {
                setOvershoot(on);
                if (!on) setCurve(round2(clampCurve(curve, false)));
              }}
            />
          </label>
        </div>
        {hasOvershoot(curve) ? (
          <Hint>Overshoot works on 1D and per-dimension properties. Position is clipped, since After Effects' speed along a path cannot go backwards.</Hint>
        ) : null}
      </Section>

      <Section title="Keyframes">
        <div className="grid">
          <ActionButton
            label="Read selected"
            avail={keyAvail}
            onClick={async () => {
              const r = await run<{ curve: Curve; property: string }>("ease.read", {}, { quiet: true });
              if (r.ok) {
                const read = round2(r.result.curve);
                if (hasOvershoot(read)) setOvershoot(true);
                setCurve(read);
                toast({ kind: "info", message: `Read the ease from ${r.result.property}` });
              }
            }}
          />
          <ActionButton
            label="Apply ease"
            primary
            avail={keyAvail}
            onClick={() =>
              run("ease.apply", { curve }, { success: (r) => `Eased ${plural(r.pairs, "keyframe pair")}` })
            }
          />
        </div>
      </Section>

      <Section title="Presets">
        <div className="chips">
          {[...DEFAULT_EASE_PRESETS, ...custom].map((p, i) => {
            const isCustom = i >= DEFAULT_EASE_PRESETS.length;
            return (
              <span key={`${p.name}-${i}`} className={sameCurve(curve, p.points) ? "chip active" : "chip"}>
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => {
                    const c = [...p.points] as Curve;
                    if (hasOvershoot(c)) setOvershoot(true);
                    setCurve(c);
                    setPreviewKey((k) => k + 1);
                  }}
                >
                  {p.name}
                </button>
                {isCustom ? (
                  <button
                    type="button"
                    className="chip-x"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => updateSettings({ easePresets: custom.filter((x) => x !== p) })}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>
        <form
          className="save-row"
          onSubmit={(e) => {
            e.preventDefault();
            const name = presetName.trim() || `Custom ${custom.length + 1}`;
            updateSettings({ easePresets: [...custom, { name, points: [...curve] }] });
            setPresetName("");
            toast({ kind: "success", message: `Saved curve "${name}"` });
          }}
        >
          <input
            className="search"
            type="text"
            placeholder="Name for the current curve"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <button type="submit" className="action compact">
            <span className="action-label">Save</span>
          </button>
        </form>
      </Section>
    </>
  );
}
