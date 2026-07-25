import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  THEME_STORAGE_KEY,
  readStored,
  writeStored,
  resolveTheme,
  applyTheme,
  nextTheme,
  type Theme,
} from "./theme";

function mockMatchMedia(matchesDark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("dark") ? matchesDark : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("theme.ts", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("readStored / writeStored", () => {
    it("defaults to system when nothing stored", () => {
      expect(readStored()).toBe("system");
    });

    it("round-trips a value through localStorage", () => {
      writeStored("dark");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
      expect(readStored()).toBe("dark");
    });

    it("round-trips light and system too", () => {
      writeStored("light");
      expect(readStored()).toBe("light");
      writeStored("system");
      expect(readStored()).toBe("system");
    });

    it("falls back to system for garbage stored values", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "not-a-theme");
      expect(readStored()).toBe("system");
    });

    it("writeStored does not throw when localStorage.setItem throws", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota exceeded");
      });
      expect(() => writeStored("dark")).not.toThrow();
      spy.mockRestore();
    });

    it("readStored does not throw when localStorage.getItem throws", () => {
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(() => readStored()).not.toThrow();
      expect(readStored()).toBe("system");
      spy.mockRestore();
    });
  });

  describe("resolveTheme", () => {
    it("passes light through unchanged", () => {
      expect(resolveTheme("light")).toBe("light");
    });

    it("passes dark through unchanged", () => {
      expect(resolveTheme("dark")).toBe("dark");
    });

    it("maps system to dark when the OS prefers dark", () => {
      mockMatchMedia(true);
      expect(resolveTheme("system")).toBe("dark");
    });

    it("maps system to light when the OS prefers light", () => {
      mockMatchMedia(false);
      expect(resolveTheme("system")).toBe("light");
    });
  });

  describe("applyTheme", () => {
    it("sets data-theme on document.documentElement to the resolved value", () => {
      applyTheme("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
    });

    it("resolves system before stamping data-theme", () => {
      mockMatchMedia(true);
      const resolved = applyTheme("system");
      expect(resolved).toBe("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
    });

    it("returns the resolved theme", () => {
      expect(applyTheme("light")).toBe("light");
    });
  });

  describe("nextTheme", () => {
    it("cycles light -> dark -> system -> light", () => {
      const seen: Theme[] = [];
      let t: Theme = "light";
      for (let i = 0; i < 4; i++) {
        seen.push(t);
        t = nextTheme(t);
      }
      expect(seen).toEqual(["light", "dark", "system", "light"]);
    });

    it("dark advances to system", () => {
      expect(nextTheme("dark")).toBe("system");
    });

    it("system advances to light", () => {
      expect(nextTheme("system")).toBe("light");
    });
  });
});
