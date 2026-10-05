import { Suspense, useState } from "react";
import { isCep } from "../bridge/cep";
import { mock, setMockComp, setMockSelection } from "../bridge/mockHost";
import { Icon } from "../components/Icons";
import { plural } from "../core/format";
import { MODULES, findModule } from "../modules/registry";
import { StoreProvider, useStore } from "./store";

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const { settings, updateSettings } = useStore();
  const [active, setActive] = useState(() => findModule(settings.lastModule).id);
  const mod = findModule(active);
  const Body = mod.component;
  const open = (id: string) => {
    setActive(id);
    updateSettings({ lastModule: id });
  };
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Modules">
        {MODULES.map((m) => {
          const I = Icon[m.icon];
          return (
            <button
              key={m.id}
              type="button"
              className={m.id === active ? "nav active" : "nav"}
              title={m.label}
              aria-label={m.label}
              aria-current={m.id === active ? "page" : undefined}
              onClick={() => open(m.id)}
            >
              <I />
            </button>
          );
        })}
      </nav>
      <main className="main">
        <header className="topbar">
          <h2>{mod.label}</h2>
          <Context />
        </header>
        <div className="content">
          <Suspense fallback={null}>
            <Body />
          </Suspense>
        </div>
        {!isCep() && <MockBar />}
      </main>
      <Toasts />
      <ProgressOverlay />
    </div>
  );
}

function Context() {
  const { state } = useStore();
  if (!state) return <span className="context muted">Connecting…</span>;
  if (!state.comp) return <span className="context muted">No comp open</span>;
  const n = state.selection.length;
  return (
    <span className="context" title={`${state.comp.width}×${state.comp.height} · ${state.comp.frameRate} fps`}>
      <span className="context-comp">{state.comp.name}</span>
      <span className="muted"> · {n ? `${plural(n, "layer")} selected` : "nothing selected"}</span>
    </span>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
          <div className="toast-body">
            <div>{t.message}</div>
            {t.detail ? (
              <ul className="toast-detail">
                {t.detail.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <Icon.close />
          </button>
        </div>
      ))}
    </div>
  );
}

function ProgressOverlay() {
  const { progress } = useStore();
  if (!progress) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={progress.title}>
      <div className="overlay-card">
        <div className="overlay-title">{progress.title}</div>
        <div className={`bar${progress.fraction === null ? " indeterminate" : ""}`}>
          <div className="bar-fill" style={{ width: `${Math.round((progress.fraction ?? 0.3) * 100)}%` }} />
        </div>
        {progress.fraction !== null ? <div className="muted small">{Math.round(progress.fraction * 100)}%</div> : null}
        {progress.onCancel ? (
          <button type="button" className="action" onClick={progress.onCancel}>
            <span className="action-label">Cancel</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Browser preview only: switch the fake selection to see every button state. */
function MockBar() {
  const { refresh } = useStore();
  const pick = (k: Parameters<typeof setMockSelection>[0]) => {
    setMockSelection(k);
    void refresh();
  };
  return (
    <div className="mockbar">
      <span className="muted">Preview</span>
      <select
        aria-label="Mock selection"
        defaultValue="clips"
        onChange={(e) => {
          if (e.target.value === "nocomp") {
            setMockComp(false);
            void refresh();
          } else pick(e.target.value as Parameters<typeof setMockSelection>[0]);
        }}
      >
        <option value="clips">6 clips selected</option>
        <option value="audio">Audio layer selected</option>
        <option value="text">Text layer selected</option>
        <option value="all">All layers selected</option>
        <option value="none">Nothing selected</option>
        <option value="nocomp">No comp open</option>
      </select>
      <span className="muted small">{mock.hasComp ? "" : "comp closed"}</span>
    </div>
  );
}
