import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  THEME_STORAGE_KEY,
  readStored,
  writeStored,
  resolveTheme,
  applyTheme,
  toggleTheme,
  subscribeTheme,
  setTheme,
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

  describe("toggleTheme", () => {
    it("light -> dark", () => {
      expect(toggleTheme("light")).toBe("dark");
    });

    it("dark -> light", () => {
      expect(toggleTheme("dark")).toBe("light");
    });

    it("system -> opposite of an OS that prefers dark", () => {
      mockMatchMedia(true);
      expect(toggleTheme("system")).toBe("light");
    });

    it("system -> opposite of an OS that prefers light", () => {
      mockMatchMedia(false);
      expect(toggleTheme("system")).toBe("dark");
    });
  });

  describe("OS theme change while stored value is system", () => {
    function mockChangeableMatchMedia() {
      let dark = false;
      const handlers = new Set<() => void>();
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return query.includes("dark") ? dark : false;
        },
        media: query,
        addEventListener: (_: string, h: () => void) => handlers.add(h),
        removeEventListener: (_: string, h: () => void) => handlers.delete(h),
      })) as unknown as typeof window.matchMedia;
      return {
        setDark(v: boolean) {
          dark = v;
          handlers.forEach((h) => h());
        },
        count: () => handlers.size,
      };
    }

    it("re-applies data-theme and notifies subscribers", () => {
      const os = mockChangeableMatchMedia();
      setTheme("system");
      const l = vi.fn();
      const unsub = subscribeTheme(l);
      os.setDark(true);
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(l).toHaveBeenCalled();
      unsub();
    });

    it("ignores OS changes when an explicit theme is stored", () => {
      const os = mockChangeableMatchMedia();
      setTheme("light");
      const l = vi.fn();
      const unsub = subscribeTheme(l);
      os.setDark(true);
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(l).not.toHaveBeenCalled();
      unsub();
    });

    it("removes the OS listener on unsubscribe", () => {
      const os = mockChangeableMatchMedia();
      const unsub = subscribeTheme(() => {});
      expect(os.count()).toBe(1);
      unsub();
      expect(os.count()).toBe(0);
    });
  });
});
