const ADJECTIVES = ["quiet", "amber", "brisk", "coral", "dusty", "eager", "faded", "grand"];
const NOUNS = ["jam", "sprint", "atlas", "harbor", "studio", "signal", "canvas", "field"];

const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SUFFIX_LENGTH = 10;

// Rejection sampling keeps the 36-symbol alphabet unbiased (256 % 36 != 0).
function randomSuffix(length: number): string {
  const limit = 256 - (256 % SUFFIX_ALPHABET.length);
  let out = "";
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit && out.length < length) out += SUFFIX_ALPHABET[b % SUFFIX_ALPHABET.length];
    }
  }
  return out;
}

function pick(list: string[]): string {
  return list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
}

export function randomRoomId(): string {
  const a = pick(ADJECTIVES);
  const n = pick(NOUNS);
  return `${a}-${n}-${randomSuffix(SUFFIX_LENGTH)}`;
}

// Accepts either a bare room id or a full board link someone shared
// (e.g. "https://host/board/eager-field-355") and returns just the id.
export function parseRoomId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/board\/([^/?#]+)/);
  return decodeURIComponent(match ? match[1] : trimmed);
}

// Presence / cursor colors — DESIGN.md 1.4, distinct from the sticky palette and accent.
export const USER_COLORS = ["#e8543f", "#7c3aed", "#0ea5a3", "#d9328a"] as const;
