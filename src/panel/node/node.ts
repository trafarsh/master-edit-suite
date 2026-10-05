/**
 * Access to Node.js inside the CEP panel (enabled by --enable-nodejs and
 * --mixed-context in the manifest). Node modules are required at runtime, never
 * bundled, and every caller must cope with `null` when running in a browser.
 */
type Fs = typeof import("node:fs");
type Path = typeof import("node:path");
type Os = typeof import("node:os");
type ChildProcess = typeof import("node:child_process");

export interface NodeApi {
  fs: Fs;
  path: Path;
  os: Os;
  childProcess: ChildProcess;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
}

let cached: NodeApi | null | undefined;

export function node(): NodeApi | null {
  if (cached !== undefined) return cached;
  const req: NodeJS.Require | undefined =
    window.cep_node?.require ?? ((window as unknown as { require?: NodeJS.Require }).require);
  if (!req) return (cached = null);
  try {
    const proc = (window.cep_node as unknown as { process?: NodeJS.Process })?.process ?? req("process");
    cached = {
      fs: req("fs"),
      path: req("path"),
      os: req("os"),
      childProcess: req("child_process"),
      platform: proc.platform,
      env: proc.env,
    };
  } catch {
    cached = null;
  }
  return cached;
}
