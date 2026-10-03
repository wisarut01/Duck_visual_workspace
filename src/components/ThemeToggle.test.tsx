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

  it("shows a sun and light label when the OS is light", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toBe("Theme: Light. Click to switch to Dark.");
    expect(button.textContent).toBe("☀");
  });

  it("shows a moon and dark label when the OS is dark", () => {
    mockMatchMedia(true);
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toBe("Theme: Dark. Click to switch to Light.");
    expect(button.textContent).toBe("☾");
  });

  it("first click from system flips the visible theme (OS light -> dark)", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("first click from system flips the visible theme (OS dark -> light)", () => {
    mockMatchMedia(true);
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("every click flips light <-> dark and updates the label", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button.getAttribute("aria-label")).toBe("Theme: Dark. Click to switch to Light.");
    fireEvent.click(button);
    expect(button.getAttribute("aria-label")).toBe("Theme: Light. Click to switch to Dark.");
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("title mirrors the label", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button").getAttribute("title")).toBe(
      "Theme: Light (click for Dark)",
    );
  });
});
