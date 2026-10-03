"use client";

import { useSyncExternalStore } from "react";
import styles from "./ThemeToggle.module.css";
import {
  toggleTheme,
  setTheme,
  subscribeTheme,
  getResolvedThemeSnapshot,
  type ResolvedTheme,
} from "@/lib/theme";

const ICON: Record<ResolvedTheme, string> = {
  light: "☀",
  dark: "☾",
};

const LABEL: Record<ResolvedTheme, string> = {
  light: "Light",
  dark: "Dark",
};

const NEUTRAL_ICON = "◐";

export interface ThemeToggleProps {
  className?: string;
}

export default function ThemeToggle({ className }: ThemeToggleProps) {
  // The displayed (resolved) theme depends on the OS, which the server can't
  // know, so the server snapshot is a placeholder and the button stays
  // disabled with a neutral icon until hydrated (mounted flag). Both are
  // useSyncExternalStore reads — no effect+setState.
  const resolved = useSyncExternalStore(
    subscribeTheme,
    getResolvedThemeSnapshot,
    (): ResolvedTheme => "light",
  );
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const upcoming = toggleTheme(resolved);

  function handleClick() {
    setTheme(toggleTheme(resolved));
  }

  return (
    <button
      type="button"
      className={className ? `${styles.btn} ${className}` : styles.btn}
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={!mounted}
      aria-label={
        mounted
          ? `Theme: ${LABEL[resolved]}. Click to switch to ${LABEL[upcoming]}.`
          : "Theme"
      }
      title={mounted ? `Theme: ${LABEL[resolved]} (click for ${LABEL[upcoming]})` : "Theme"}
    >
      {mounted ? ICON[resolved] : NEUTRAL_ICON}
    </button>
  );
}
