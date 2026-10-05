/**
 * Shared panel state: host snapshot (polled), settings, toasts and the progress
 * overlay. Every module runs host actions through `run`, which gives all of them
 * the same feedback, logging and error behaviour.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { callHost, hostBusy } from "../bridge/host";
import { onMockChange } from "../bridge/mockHost";
import type { HostResult, HostState } from "../bridge/types";
import type { Settings } from "../core/settings";
import { logger } from "../node/logger";
import { loadSettings, saveSettings } from "../node/settingsStore";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
  detail?: string[];
}

export interface Progress {
  title: string;
  fraction: number | null;
  onCancel?: () => void;
}

export interface RunOptions {
  /** Success message built from the host result. */
  success?: (result: any) => string;
  /** Skip the success toast (the caller shows its own feedback). */
  quiet?: boolean;
}

interface Store {
  state: HostState | null;
  refresh(): Promise<void>;
  settings: Settings;
  updateSettings(patch: Partial<Settings>): void;
  run<T = any>(action: string, args?: unknown, opts?: RunOptions): Promise<HostResult<T>>;
  toasts: Toast[];
  toast(t: Omit<Toast, "id">): void;
  dismissToast(id: number): void;
  progress: Progress | null;
  setProgress(p: Progress | null): void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

const TOAST_MS = 4000;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HostState | null>(null);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const nextId = useRef(1);
  const lastStateJson = useRef("");

  const refresh = useCallback(async () => {
    const r = await callHost<HostState>("state.get");
    if (r.ok) {
      // Avoid re-rendering every module on each poll when nothing changed.
      const json = JSON.stringify(r.result);
      if (json !== lastStateJson.current) {
        lastStateJson.current = json;
        setState(r.result);
      }
    } else if (r.error.code === "no_host") {
      logger.warn("state.get failed", r.error);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const off = onMockChange(onFocus);
    const timer = window.setInterval(() => {
      if (!hostBusy() && !document.hidden) void refresh();
    }, settings.pollMs);
    return () => {
      window.removeEventListener("focus", onFocus);
      off();
      window.clearInterval(timer);
    };
  }, [refresh, settings.pollMs]);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { ...t, id }]);
      window.setTimeout(() => dismissToast(id), t.kind === "error" ? TOAST_MS * 2 : TOAST_MS);
    },
    [dismissToast],
  );

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const run = useCallback(
    async <T,>(action: string, args?: unknown, opts: RunOptions = {}): Promise<HostResult<T>> => {
      const started = performance.now();
      const r = await callHost<T>(action, args);
      const ms = Math.round(performance.now() - started);
      if (r.ok) {
        logger.info(`${action} ok in ${ms} ms`, { undo: r.undo, warnings: r.warnings });
        if (!opts.quiet) {
          const message = opts.success ? opts.success(r.result) : "Done";
          toast({
            kind: "success",
            message: r.undo ? `${message} · Undo: ${r.undo}` : message,
            detail: r.warnings.length ? r.warnings : undefined,
          });
        }
      } else {
        logger.error(`${action} failed in ${ms} ms`, r.error);
        toast({ kind: "error", message: r.error.message, detail: r.warnings.length ? r.warnings : undefined });
      }
      void refresh();
      return r;
    },
    [refresh, toast],
  );

  const value = useMemo<Store>(
    () => ({ state, refresh, settings, updateSettings, run, toasts, toast, dismissToast, progress, setProgress }),
    [state, refresh, settings, updateSettings, run, toasts, toast, dismissToast, progress],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
