const ADJECTIVES = ["quiet", "amber", "brisk", "coral", "dusty", "eager", "faded", "grand"];
const NOUNS = ["jam", "sprint", "atlas", "harbor", "studio", "signal", "canvas", "field"];

export function randomRoomId(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${a}-${n}-${suffix}`;
}

// Presence / cursor colors — DESIGN.md 1.4, distinct from the sticky palette and accent.
export const USER_COLORS = ["#e8543f", "#7c3aed", "#0ea5a3", "#d9328a"] as const;
