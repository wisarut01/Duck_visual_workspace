"use client";

import { useSyncExternalStore } from "react";
import styles from "./ThemeToggle.module.css";
import {
  nextTheme,
  setTheme,
  subscribeTheme,
  getThemeSnapshot,
  getServerThemeSnapshot,
  type Theme,
} from "@/lib/theme";

const ICON: Record<Theme, string> = {
  light: "☀",
  dark: "☾",
  system: "◐",
};

const LABEL: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export interface ThemeToggleProps {
  className?: string;
}

export default function ThemeToggle({ className }: ThemeToggleProps) {
  // Same useSyncExternalStore-based hydration guard as JoinCard's submit
  // button, generalized to the theme value itself: the server (and the
  // client's pre-hydration paint, which must match it) always sees
  // "system"/not-mounted, so there's no window where a click could read a
  // stale snapshot or where hydration sees mismatched text.
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const displayed: Theme = mounted ? theme : "system";
  const upcoming = LABEL[nextTheme(displayed)];

  function handleClick() {
    setTheme(nextTheme(displayed));
  }

  return (
    <button
      type="button"
      className={className ? `${styles.btn} ${className}` : styles.btn}
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={!mounted}
      aria-label={`Theme: ${LABEL[displayed]}. Click to switch to ${upcoming}.`}
      title={`Theme: ${LABEL[displayed]} (click for ${upcoming})`}
    >
      {ICON[displayed]}
    </button>
  );
}
