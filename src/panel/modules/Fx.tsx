/** FX manager: every effect in the comp grouped by type, switched on or off in one click. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../app/store";
import { callHost } from "../bridge/host";
import type { FxGroup, FxInstanceRef } from "../bridge/types";
import { Icon } from "../components/Icons";
import { Hint, Segmented, Switch } from "../components/ui";
import { plural } from "../core/format";
import { needsComp } from "../core/requirements";

interface FxList {
  groups: FxGroup[];
  total: number;
  layers: number;
}

const ALL = "*";

export function Fx() {
  const { state, run, settings, updateSettings, toast } = useStore();
  const [list, setList] = useState<FxList | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  // Instances switched off by the last "off" toggle per group, so "on" restores exactly those.
  const snapshots = useRef<Record<string, FxInstanceRef[]>>({});
  const scope = settings.fxScope;
  const comp = needsComp(state);
  const compKey = state?.comp ? `${state.comp.id}:${state.comp.numLayers}` : "";
  const selKey = scope === "selected" ? state?.selection.map((l) => l.id).join(",") : "";

  const load = useCallback(async () => {
    if (!comp.enabled) {
      setList(null);
      return;
    }
    setLoading(true);
    const r = await callHost<FxList>("fx.list", { scope });
    setLoading(false);
    if (r.ok) setList(r.result);
    else toast({ kind: "error", message: r.error.message });
  }, [comp.enabled, scope, toast]);

  useEffect(() => {
    snapshots.current = {};
    void load();
  }, [load, compKey, selKey]);

  const toggle = async (matchName: string | null, enabled: boolean) => {
    const key = `${scope}:${matchName ?? ALL}`;
    const restore = enabled ? snapshots.current[key] : undefined;
    const r = await run<{ changed: FxInstanceRef[] }>(
      "fx.setEnabled",
      { scope, matchName, enabled, restore: restore ?? null },
      { success: (res) => `${enabled ? "Enabled" : "Disabled"} ${plural(res.changed.length, "effect")}` },
    );
    if (r.ok) {
      if (enabled) delete snapshots.current[key];
      else snapshots.current[key] = r.result.changed;
      await load();
    }
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list?.groups ?? []).filter((g) => !q || g.name.toLowerCase().includes(q) || g.matchName.toLowerCase().includes(q));
  }, [list, query]);

  if (!comp.enabled) return <Hint>{comp.reason}.</Hint>;

  const allOn = list ? list.groups.reduce((n, g) => n + g.on, 0) : 0;
  const masterState = !list || list.total === 0 ? "off" : allOn === 0 ? "off" : allOn === list.total ? "on" : "mixed";

  return (
    <>
      <div className="toolbar">
        <Segmented
          value={scope}
          onChange={(v) => updateSettings({ fxScope: v })}
          options={[
            { id: "comp", label: "Whole comp" },
            { id: "selected", label: "Selected layers" },
          ]}
        />
        <button type="button" className="icon-btn" title="Refresh" onClick={() => void load()}>
          <Icon.refresh />
        </button>
      </div>
      <input
        className="search"
        type="search"
        placeholder="Search effects"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="fx-row master">
        <span className="fx-name">All effects</span>
        <span className="fx-count">{list ? list.total : "…"}</span>
        <Switch
          label="All effects"
          checked={masterState !== "off"}
          mixed={masterState === "mixed"}
          onChange={(on) => void toggle(null, masterState === "mixed" ? false : on)}
        />
      </div>
      {loading && !list ? <Hint>Reading effects…</Hint> : null}
      {list && list.total === 0 ? (
        <Hint>{scope === "selected" ? "The selected layers have no effects." : "This comp has no effects."}</Hint>
      ) : null}
      <ul className="fx-list">
        {groups.map((g) => (
          <li key={g.matchName} className="fx-row">
            <button
              type="button"
              className="fx-name link"
              title="Select the layers that use this effect"
              onClick={() =>
                void run("fx.selectLayers", { matchName: g.matchName }, { success: (r) => `Selected ${plural(r.selected, "layer")}` })
              }
            >
              {g.name}
            </button>
            <span className="fx-count">×{g.count}</span>
            <Switch
              label={g.name}
              checked={g.state !== "off"}
              mixed={g.state === "mixed"}
              onChange={(on) => void toggle(g.matchName, g.state === "mixed" ? false : on)}
            />
          </li>
        ))}
      </ul>
      <Hint>Switching a group back on restores each instance to how it was before you switched it off.</Hint>
    </>
  );
}
