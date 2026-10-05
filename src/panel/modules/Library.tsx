/** Library: one searchable place for presets, sound effects and textures, applied in one click. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../app/store";
import { callHost } from "../bridge/host";
import { mockManifest } from "../bridge/mockHost";
import { Icon } from "../components/Icons";
import { ActionButton, Hint, Switch, Tabs, TextField } from "../components/ui";
import { plural } from "../core/format";
import { TABS, groupByCategory, searchItems, type LibraryItem, type LibraryTab, type Manifest } from "../core/library";
import { needsComp, needsLayers, rules, type Availability } from "../core/requirements";
import { TEXTURE_BLENDS, type TextureBlend } from "../core/settings";
import { fileUrl, loadLibrary, rescanLibrary } from "../node/library";
import { node } from "../node/node";

const BLEND_LABELS: Record<TextureBlend, string> = {
  SCREEN: "Screen",
  ADD: "Add",
  OVERLAY: "Overlay",
  SOFT_LIGHT: "Soft Light",
  MULTIPLY: "Multiply",
  NORMAL: "Normal",
};

export function Library() {
  const { settings, updateSettings, toast } = useStore();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<LibraryTab>("presets");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<LibraryItem | null>(null);
  const [hovered, setHovered] = useState<LibraryItem | null>(null);
  const hasNode = !!node();

  const load = useCallback(
    (rescan: boolean) => {
      if (!hasNode) {
        setManifest(mockManifest());
        return;
      }
      if (!settings.libraryPath) {
        setManifest(null);
        return;
      }
      try {
        const m = rescan ? rescanLibrary(settings.libraryPath) : loadLibrary(settings.libraryPath);
        setManifest(m);
        setError(null);
        if (rescan) toast({ kind: "info", message: `Library rescanned: ${plural(m.items.length, "item")}` });
      } catch (e) {
        setError((e as Error).message);
        setManifest(null);
      }
    },
    [hasNode, settings.libraryPath, toast],
  );

  useEffect(() => load(false), [load]);

  const tabItems = useMemo(() => (manifest?.items ?? []).filter((i) => i.tab === tab), [manifest, tab]);
  const hits = useMemo(() => searchItems(tabItems, query), [tabItems, query]);
  const groups = useMemo(() => groupByCategory(hits, tab, !query.trim()), [hits, tab, query]);
  const unlicensed = useMemo(() => (manifest?.items ?? []).filter((i) => !i.licence).length, [manifest]);

  if (hasNode && !settings.libraryPath) {
    return (
      <>
        <Hint>Choose the folder that holds your library. It can live on any drive.</Hint>
        <TextField
          label="Library folder"
          value=""
          placeholder="e.g. D:\\Editing\\Library"
          onChange={(v) => updateSettings({ libraryPath: v.trim() })}
        />
        <LayoutHelp />
      </>
    );
  }

  const counts = (id: LibraryTab) => String((manifest?.items ?? []).filter((i) => i.tab === id).length);
  const preview = hovered ?? picked;
  const searching = !!query.trim();

  return (
    <div className="library">
      <Tabs<LibraryTab>
        value={tab}
        onChange={(t) => {
          setTab(t);
          setPicked(null);
        }}
        tabs={TABS.map((t) => ({ ...t, badge: counts(t.id) }))}
      />
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder={`Search ${TABS.find((t) => t.id === tab)!.label.toLowerCase()}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="icon-btn" title="Rescan the library folder" onClick={() => load(true)}>
          <Icon.refresh />
        </button>
      </div>
      {error ? <Hint>{error}</Hint> : null}
      {!hasNode ? <Hint>Browser preview: sample items, nothing is read from disk.</Hint> : null}
      {unlicensed > 0 ? (
        <p className="warning">{plural(unlicensed, "item")} without a licence source. Add a licence.txt or a .json sidecar.</p>
      ) : null}

      {tab !== "sounds" && preview?.preview ? <PreviewBox item={preview} /> : null}

      <div className="lib-list">
        {groups.map((g) => {
          const isOpen = searching || !!open[`${tab}/${g.category}`];
          return (
            <div key={g.category} className="lib-cat">
              <button
                type="button"
                className="lib-cat-head"
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [`${tab}/${g.category}`]: !isOpen }))}
              >
                <span className={isOpen ? "caret open" : "caret"}>▸</span>
                <span className="lib-cat-name">{g.category}</span>
                <span className="fx-count">{g.items.length}</span>
              </button>
              {isOpen && (
                <ul className="lib-items">
                  {g.items.length === 0 ? <li className="muted small lib-empty">Empty</li> : null}
                  {g.items.map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        className={picked?.id === it.id ? "lib-item active" : "lib-item"}
                        onClick={() => setPicked(it)}
                        onMouseEnter={() => setHovered(it)}
                        onMouseLeave={() => setHovered(null)}
                      >
                        <span className="lib-item-name">{it.name}</span>
                        {it.needsTwixtor ? <span className="badge">Twixtor</span> : null}
                        {!it.licence ? <span className="badge warn">No licence</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {searching && hits.length === 0 ? <Hint>Nothing matches "{query}".</Hint> : null}
      </div>

      <div className="lib-footer">
        {tab === "presets" && <PresetActions item={picked} />}
        {tab === "sounds" && <SoundActions item={picked} />}
        {tab === "textures" && <TextureActions item={picked} />}
      </div>
    </div>
  );
}

function PreviewBox({ item }: { item: LibraryItem }) {
  const src = node() ? fileUrl(item.preview!) : "";
  const isVideo = /\.(webm|mp4|mov)$/i.test(item.preview!);
  return (
    <div className="lib-preview">
      {src ? (
        isVideo ? <video src={src} autoPlay loop muted playsInline /> : <img src={src} alt={item.name} />
      ) : (
        <span className="muted small">Preview of {item.name}</span>
      )}
    </div>
  );
}

function pickedAvail(item: LibraryItem | null, noun: string, base: Availability): Availability {
  if (!item) return { enabled: false, target: "", reason: `Pick a ${noun} above`, layers: [] };
  return base.enabled ? { ...base, target: base.target ? `${item.name} · ${base.target}` : item.name } : base;
}

function PresetActions({ item }: { item: LibraryItem | null }) {
  const { state, run, settings, updateSettings } = useStore();
  const [twixtorMissing, setTwixtorMissing] = useState<boolean | null>(null);
  const checked = useRef(false);

  useEffect(() => {
    if (!item?.needsTwixtor || checked.current) return;
    checked.current = true;
    void callHost<{ matchNames: string[] }>("host.findEffects", { pattern: "twixtor" }).then((r) =>
      setTwixtorMissing(r.ok ? r.result.matchNames.length === 0 : null),
    );
  }, [item]);

  return (
    <>
      <label className="option">
        <Switch label="Stretch keyframes to layer duration" checked={settings.presetStretch} onChange={(v) => updateSettings({ presetStretch: v })} />
        <span>Stretch keyframes to layer duration</span>
      </label>
      <label className="option">
        <Switch label="Apply at layer start" checked={settings.presetAtLayerStart} onChange={(v) => updateSettings({ presetAtLayerStart: v })} />
        <span>Apply at layer start (otherwise at the playhead)</span>
      </label>
      {item?.needsTwixtor && twixtorMissing ? (
        <p className="warning">This preset needs the Twixtor plugin, which is not installed.</p>
      ) : null}
      <ActionButton
        label="Apply to selected"
        primary
        avail={pickedAvail(item, "preset", needsLayers(state, rules.anyLayer))}
        onClick={() =>
          run(
            "library.applyPreset",
            { file: item!.file, atLayerStart: settings.presetAtLayerStart, stretch: settings.presetStretch },
            { success: (r) => `Applied ${item!.name} to ${plural(r.layers, "layer")}` },
          )
        }
      />
    </>
  );
}

function SoundActions({ item }: { item: LibraryItem | null }) {
  const { state, run } = useStore();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    audio.current?.pause();
    setPlaying(false);
    if (item && node()) {
      audio.current = new Audio(fileUrl(item.file));
      audio.current.onended = () => setPlaying(false);
      void audio.current.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    }
    return () => audio.current?.pause();
  }, [item]);

  const comp = needsComp(state);
  return (
    <div className="grid">
      <button
        type="button"
        className="action"
        disabled={!item || !node()}
        onClick={() => {
          if (!audio.current) return;
          if (playing) {
            audio.current.pause();
            audio.current.currentTime = 0;
            setPlaying(false);
          } else void audio.current.play().then(() => setPlaying(true));
        }}
      >
        <span className="action-label">{playing ? "Stop" : "Preview"}</span>
        <span className="action-sub">{item ? item.name : "Pick a sound"}</span>
      </button>
      <ActionButton
        label="Insert at playhead"
        primary
        avail={pickedAvail(item, "sound", comp.enabled ? { ...comp, target: "" } : comp)}
        onClick={() => run("library.insertSound", { file: item!.file }, { success: () => `Inserted ${item!.name} at the playhead` })}
      />
    </div>
  );
}

function TextureActions({ item }: { item: LibraryItem | null }) {
  const { state, run, settings, updateSettings } = useStore();
  const comp = needsComp(state);
  return (
    <>
      <label className="field">
        <span className="field-label">Blending mode</span>
        <select
          className="select"
          value={settings.textureBlend}
          onChange={(e) => updateSettings({ textureBlend: e.target.value as TextureBlend })}
        >
          {TEXTURE_BLENDS.map((b) => (
            <option key={b} value={b}>
              {BLEND_LABELS[b]}
            </option>
          ))}
        </select>
      </label>
      <ActionButton
        label="Insert texture"
        primary
        avail={pickedAvail(item, "texture", comp.enabled ? { ...comp, target: "" } : comp)}
        onClick={() =>
          run(
            "library.insertTexture",
            { file: item!.file, blendMode: settings.textureBlend },
            { success: () => `Inserted ${item!.name}, fitted to the comp` },
          )
        }
      />
    </>
  );
}

function LayoutHelp() {
  return (
    <div className="planned">
      <p className="muted">Expected layout:</p>
      <pre className="code">{`<library>/presets/<category>/<name>.ffx
<library>/presets/<category>/<name>.webm   (optional preview)
<library>/sounds/<category>/<name>.wav
<library>/textures/<category>/<name>.png
<category>/licence.txt or <name>.json   (licence source)`}</pre>
    </div>
  );
}
