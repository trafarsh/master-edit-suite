/**
 * Follows After Effects' interface brightness: the panel background matches the
 * host exactly and the other surfaces are derived from it.
 */
import { hostEnvironment, onCepEvent, THEME_CHANGED_EVENT, type RGB } from "../bridge/cep";

function shade({ red, green, blue }: RGB, delta: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + delta)));
  return `rgb(${c(red)}, ${c(green)}, ${c(blue)})`;
}

export function themeVars(bg: RGB): Record<string, string> {
  const luminance = (0.2126 * bg.red + 0.7152 * bg.green + 0.0722 * bg.blue) / 255;
  const light = luminance > 0.5;
  const s = light ? -1 : 1;
  return {
    "--bg": shade(bg, 0),
    "--surface": shade(bg, 8 * s),
    "--surface-2": shade(bg, 16 * s),
    "--surface-3": shade(bg, 26 * s),
    "--border": shade(bg, 30 * s),
    "--text": light ? "rgb(25, 25, 25)" : "rgb(228, 228, 228)",
    "--text-muted": light ? "rgb(85, 85, 85)" : "rgb(150, 150, 150)",
  };
}

function apply() {
  const env = hostEnvironment();
  const bg = env?.appSkinInfo?.panelBackgroundColor?.color;
  if (!bg) return; // Browser preview keeps the stylesheet's dark defaults.
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeVars(bg))) root.style.setProperty(k, v);
}

export function initTheme(): void {
  apply();
  onCepEvent(THEME_CHANGED_EVENT, apply);
}
