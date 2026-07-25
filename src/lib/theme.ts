// Light/dark/system theme selection. Pure, no React — see ThemeToggle.tsx
// for the component and layout.tsx for the pre-hydration no-flash script
// that mirrors resolveTheme()/applyTheme() in plain JS.
//
// globals.css already defines the actual color tokens for both themes
// (`:root` + `@media (prefers-color-scheme: dark)` for the "system" case,
// and `:root[data-theme="light"]` / `:root[data-theme="dark"]` overrides
// that win on specificity when a resolved value is stamped onto <html>).
// This module only decides *which* value to stamp, and persists the user's
// preference.

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "coboard:theme";

const ORDER: Theme[] = ["light", "dark", "system"];

function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark" || v === "system";
}

/** Reads the persisted theme preference, defaulting to "system". */
export function readStored(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : "system";
  } catch {
    // storage may be unavailable (private browsing, quota)
    return "system";
  }
}

/** Persists the theme preference. Best-effort — never throws. */
export function writeStored(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // best-effort only, same as lib/profile.ts
  }
}

/** Maps "system" to the OS/browser preference; light/dark pass through. */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Stamps the resolved theme onto <html data-theme="…"> for globals.css to pick up. */
export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolved;
  }
  return resolved;
}

/** Cycle order for the toggle button: light -> dark -> system -> light. */
export function nextTheme(theme: Theme): Theme {
  const i = ORDER.indexOf(theme);
  return ORDER[(i + 1) % ORDER.length];
}

// --- Tiny external store, so ThemeToggle can use useSyncExternalStore for
// the theme value itself (not just a boolean "mounted" flag) instead of
// useEffect+setState — same rationale as JoinCard's hydration guard: a
// one-shot effect-driven setState trips `react-hooks/set-state-in-effect`
// and causes an extra render; useSyncExternalStore is the sanctioned fix.

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to theme changes made via setTheme() (any component instance). */
export function subscribeTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Snapshot for useSyncExternalStore's client getSnapshot. */
export function getThemeSnapshot(): Theme {
  return readStored();
}

/** Snapshot for useSyncExternalStore's getServerSnapshot (SSR + pre-hydration paint). */
export function getServerThemeSnapshot(): Theme {
  return "system";
}

/** Persists + applies a new theme and notifies all subscribed ThemeToggle instances. */
export function setTheme(theme: Theme): ResolvedTheme {
  writeStored(theme);
  const resolved = applyTheme(theme);
  listeners.forEach((l) => l());
  return resolved;
}
