"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { USER_COLORS } from "@/lib/room";
import { loadProfile, saveProfile, defaultProfile } from "@/lib/profile";

export interface JoinCardProps {
  roomId: string;
  onJoin: (name: string, color: string) => void;
}

export default function JoinCard({ roomId, onJoin }: JoinCardProps) {
  const initial = loadProfile() ?? defaultProfile();
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState<string>(initial.color);
  // Guards against a native (non-JS) form submit firing on a slow mobile
  // connection: the submit button is disabled until hydration has actually
  // attached the onSubmit handler, so an early tap can't fall through to a
  // real page navigation before React is ready to intercept it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const finalName = name.trim() || "Guest";
    saveProfile({ name: finalName, color });
    onJoin(finalName, color);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        backgroundColor: "var(--bg)",
        backgroundImage: "radial-gradient(var(--dot) 1.4px, transparent 1.4px)",
        backgroundSize: "26px 26px",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "min(360px, 100%)",
          background: "var(--panel)",
          border: "1px solid var(--panel-border)",
          borderRadius: "var(--r-panel)",
          boxShadow: "var(--panel-shadow)",
          padding: 26,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: "var(--accent)",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            C
          </span>
          <b style={{ fontSize: 16, letterSpacing: "-0.01em" }}>Coboard</b>
          <span
            style={{
              font: "500 11px/1 var(--font-mono)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--ink-faint)",
              border: "1px solid var(--panel-border)",
              borderRadius: 6,
              padding: "5px 8px",
              marginLeft: "auto",
            }}
          >
            room · {roomId}
          </span>
        </div>

        <div>
          <label
            htmlFor="jname"
            style={{
              font: "600 11px/1 var(--font-mono)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--ink-soft)",
              display: "block",
              marginBottom: 8,
            }}
          >
            Your name
          </label>
          <input
            id="jname"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            spellCheck={false}
            style={{
              width: "100%",
              font: "500 14px/1.3 var(--font-ui)",
              color: "var(--ink)",
              background: "var(--bg)",
              border: "1px solid var(--panel-border)",
              borderRadius: "var(--r-control)",
              padding: "10px 12px",
              outline: "none",
            }}
          />
        </div>

        <div>
          <label
            style={{
              font: "600 11px/1 var(--font-mono)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--ink-soft)",
              display: "block",
              marginBottom: 8,
            }}
          >
            Cursor color
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {USER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => setColor(c)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: c,
                  cursor: "pointer",
                  border: `3px solid ${color === c ? "var(--ink)" : "transparent"}`,
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={!mounted}
          style={{
            font: "600 14px/1 var(--font-ui)",
            color: "#fff",
            background: "var(--accent)",
            border: 0,
            borderRadius: "var(--r-control)",
            padding: 12,
            cursor: mounted ? "pointer" : "default",
            opacity: mounted ? 1 : 0.6,
          }}
        >
          {mounted ? "Join board" : "Loading…"}
        </button>
        <div style={{ font: "500 11px/1.6 var(--font-mono)", color: "var(--ink-faint)", display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span>No account needed — you join as a guest via this room link.</span>
          <Link href="/dashboard" style={{ color: "var(--accent)", whiteSpace: "nowrap" }}>
            My boards
          </Link>
        </div>
      </form>
    </div>
  );
}
