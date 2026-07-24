// Guest-join convenience only (used by JoinCard to prefill a name/color for
// people opening a board link without an account — joining a board never
// requires signing in). Real accounts (epic 7) live in the DB; see
// lib/api.ts + /login, /register, /profile for that flow.
import { USER_COLORS } from "./room";

export interface Profile {
  name: string;
  color: string;
}

const KEY = "coboard:profile";

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Profile>;
    if (!p.name || !p.color) return null;
    return { name: p.name, color: p.color };
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage may be unavailable (private browsing, quota) — prefill is best-effort only
  }
}

export function defaultProfile(): Profile {
  return { name: "You", color: USER_COLORS[3] };
}
