import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ThemeToggle from "./ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

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

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    mockMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a single button", () => {
    render(<ThemeToggle />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(1);
  });

  it("has an accessible label describing the current state", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label") || button.getAttribute("title")).toBeTruthy();
  });

  it("clicking advances the theme (system -> light) and updates the label", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    const before = button.getAttribute("aria-label") || button.getAttribute("title");
    fireEvent.click(button);
    const after = button.getAttribute("aria-label") || button.getAttribute("title");
    expect(after).not.toBe(before);
  });

  it("persists the new theme to localStorage on click", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("cycling three clicks returns to the starting persisted value", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    fireEvent.click(button); // system -> light
    fireEvent.click(button); // light -> dark
    fireEvent.click(button); // dark -> system
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("applies data-theme to document.documentElement on click", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    fireEvent.click(button); // -> light
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
