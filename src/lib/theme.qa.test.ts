// QA acceptance tests (written independently of the implementation):
// one click on the theme control must always flip the visible theme.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { THEME_STORAGE_KEY, toggleTheme, setTheme, readStored, resolveTheme, type Theme } from "./theme";

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

describe("QA: theme toggle is two-state", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("explicit themes flip", () => {
    mockMatchMedia(false);
    expect(toggleTheme("light")).toBe("dark");
    expect(toggleTheme("dark")).toBe("light");
  });

  it("system resolves against the OS, then flips", () => {
    mockMatchMedia(true);
    expect(toggleTheme("system")).toBe("light");
    mockMatchMedia(false);
    expect(toggleTheme("system")).toBe("dark");
  });

  for (const osDark of [true, false]) {
    for (const start of ["light", "dark", "system"] as Theme[]) {
      it(`every click changes the visible theme (os ${osDark ? "dark" : "light"}, start ${start})`, () => {
        mockMatchMedia(osDark);
        if (start !== "system") localStorage.setItem(THEME_STORAGE_KEY, start);
        let visible = resolveTheme(readStored());
        for (let click = 0; click < 4; click++) {
          const applied = setTheme(toggleTheme(readStored()));
          expect(applied).not.toBe(visible);
          expect(document.documentElement.dataset.theme).toBe(applied);
          visible = applied;
        }
      });
    }
  }

  it("nothing stored still follows the OS until the first click", () => {
    mockMatchMedia(true);
    expect(readStored()).toBe("system");
    expect(resolveTheme(readStored())).toBe("dark");
  });
});
