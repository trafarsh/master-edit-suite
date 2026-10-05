/**
 * Typed client for the ExtendScript host API. The panel never edits the project
 * itself; every change goes through callHost(action, args), which runs
 * MES.call(action, argsJson) in After Effects. Calls are serialised because
 * ExtendScript is single-threaded and a poll must never interleave an action.
 */
import { evalScript, isCep } from "./cep";
import { mockCall } from "./mockHost";
import type { HostResult } from "./types";

let queue: Promise<unknown> = Promise.resolve();
let busyCount = 0;

export function buildScript(action: string, args: unknown): string {
  // Double JSON encoding yields a valid ES3 string literal holding the args JSON.
  return `MES.call(${JSON.stringify(action)}, ${JSON.stringify(JSON.stringify(args ?? {}))})`;
}

export function parseEnvelope<T>(raw: string, action: string): HostResult<T> {
  if (!raw || raw === "undefined" || raw === "EvalScript error.") {
    return {
      ok: false,
      undo: null,
      warnings: [],
      error: {
        message: "After Effects did not answer. The host script may not have loaded; try reopening the panel.",
        code: "no_host",
        details: { action, raw },
      },
    };
  }
  try {
    const env = JSON.parse(raw) as HostResult<T>;
    return { ...env, warnings: env.warnings ?? [] } as HostResult<T>;
  } catch {
    return {
      ok: false,
      undo: null,
      warnings: [],
      error: { message: "After Effects returned an unreadable answer.", code: "bad_envelope", details: { action, raw } },
    };
  }
}

async function rawCall(action: string, args: unknown): Promise<string> {
  if (isCep()) return evalScript(buildScript(action, args));
  return mockCall(action, args);
}

export function callHost<T>(action: string, args?: unknown): Promise<HostResult<T>> {
  busyCount++;
  const run = async (): Promise<HostResult<T>> => {
    try {
      return parseEnvelope<T>(await rawCall(action, args), action);
    } catch (e) {
      return {
        ok: false,
        undo: null,
        warnings: [],
        error: { message: (e as Error).message, code: "bridge", details: { action } },
      };
    }
  };
  const p = queue.then(run, run).finally(() => {
    busyCount--;
  });
  queue = p;
  return p;
}

/** True while any host call is queued or running; pollers skip their tick then. */
export function hostBusy(): boolean {
  return busyCount > 0;
}
