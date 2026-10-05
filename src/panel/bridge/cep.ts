/**
 * Thin typed wrapper over the CEP runtime object (window.__adobe_cep__), covering
 * the few calls CSInterface.js would otherwise provide. Every function degrades
 * gracefully outside After Effects so the panel also runs in a normal browser.
 */

interface AdobeCep {
  evalScript(script: string, callback: (result: string) => void): void;
  getHostEnvironment(): string;
  getSystemPath(type: string): string;
  addEventListener(type: string, listener: (event: unknown) => void, obj?: unknown): void;
  requestOpenExtension?(id: string, params: string): void;
}

declare global {
  interface Window {
    __adobe_cep__?: AdobeCep;
    cep_node?: { require: NodeJS.Require };
    cep?: { util?: { openURLInDefaultBrowser(url: string): void } };
  }
}

export interface RGB {
  red: number;
  green: number;
  blue: number;
}

export interface HostEnvironment {
  appName: string;
  appVersion: string;
  appLocale: string;
  appSkinInfo: {
    panelBackgroundColor: { color: RGB };
    baseFontSize: number;
  };
}

export const THEME_CHANGED_EVENT = "com.adobe.csxs.events.ThemeColorChanged";

export function isCep(): boolean {
  return typeof window !== "undefined" && !!window.__adobe_cep__;
}

export function evalScript(script: string): Promise<string> {
  const cep = window.__adobe_cep__;
  if (!cep) return Promise.reject(new Error("Not running inside After Effects"));
  return new Promise((resolve) => cep.evalScript(script, resolve));
}

export function hostEnvironment(): HostEnvironment | null {
  try {
    return window.__adobe_cep__ ? (JSON.parse(window.__adobe_cep__.getHostEnvironment()) as HostEnvironment) : null;
  } catch {
    return null;
  }
}

/** Absolute path of the installed extension folder (CSInterface's SystemPath.EXTENSION). */
export function extensionPath(): string | null {
  const cep = window.__adobe_cep__;
  if (!cep) return null;
  const raw = decodeURI(cep.getSystemPath("extension"));
  return /^file:\/\/\/[A-Za-z]:/.test(raw) ? raw.replace("file:///", "") : raw.replace("file://", "");
}

export function onCepEvent(type: string, listener: () => void): void {
  window.__adobe_cep__?.addEventListener(type, listener);
}
