import type { Metadata } from "next";
import "./globals.css";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Coboard",
  description: "Realtime collaborative brainstorm whiteboard",
};

// Sets data-theme on <html> before first paint, mirroring
// lib/theme.ts's readStored()/resolveTheme()/applyTheme() in plain JS
// (that module can't run here — this has to be a blocking inline script,
// not a React/module import, or the point of "before first paint" is
// lost). Wrapped in try/catch since localStorage can throw in some
// privacy modes (same reasoning as lib/theme.ts's own try/catch).
const noFlashScript = `
try {
  var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  var theme = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  var resolved = theme === "system"
    ? (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  document.documentElement.dataset.theme = resolved;
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
