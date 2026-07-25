"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { randomRoomId } from "@/lib/room";
import { touchBoard } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

export default function Home() {
  const router = useRouter();
  const [joinId, setJoinId] = useState("");

  function createBoard() {
    const id = randomRoomId();
    touchBoard(id, "Untitled board").catch(() => {});
    router.push(`/board/${id}`);
  }

  function joinBoard(e: React.FormEvent) {
    e.preventDefault();
    const id = joinId.trim().toLowerCase().replace(/\s+/g, "-");
    if (id) router.push(`/board/${id}`);
  }

  return (
    <div
      style={{
        minHeight: "100%",
        display: "grid",
        placeItems: "center",
        backgroundColor: "var(--bg)",
        backgroundImage: "radial-gradient(var(--dot) 1.4px, transparent 1.4px)",
        backgroundSize: "26px 26px",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(380px, 100%)",
          background: "var(--panel)",
          border: "1px solid var(--panel-border)",
          borderRadius: "var(--r-panel)",
          boxShadow: "var(--panel-shadow)",
          padding: 26,
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
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
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/dashboard" style={{ font: "600 12px/1 var(--font-ui)", color: "var(--accent)", textDecoration: "none" }}>
              My boards
            </Link>
            <Link href="/login" style={{ font: "600 12px/1 var(--font-ui)", color: "var(--ink-soft)", textDecoration: "none" }}>
              Log in
            </Link>
            <ThemeToggle />
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--ink-soft)" }}>
          A realtime whiteboard for brainstorming — sticky notes, shapes, frames,
          comments. No account needed to join.
        </p>

        <button
          onClick={createBoard}
          style={{
            font: "600 14px/1 var(--font-ui)",
            color: "#fff",
            background: "var(--accent)",
            border: 0,
            borderRadius: "var(--r-control)",
            padding: 12,
            cursor: "pointer",
          }}
        >
          Create a new board
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: "var(--hair)" }} />
          <span
            style={{
              font: "600 11px/1 var(--font-mono)",
              letterSpacing: "0.04em",
              color: "var(--ink-faint)",
            }}
          >
            OR
          </span>
          <div style={{ flex: 1, height: 1, background: "var(--hair)" }} />
        </div>

        <form onSubmit={joinBoard} style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="room id, e.g. design-jam"
            spellCheck={false}
            style={{
              flex: 1,
              minWidth: 0,
              font: "500 14px/1.3 var(--font-ui)",
              color: "var(--ink)",
              background: "var(--bg)",
              border: "1px solid var(--panel-border)",
              borderRadius: "var(--r-control)",
              padding: "10px 12px",
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              font: "600 13px/1 var(--font-ui)",
              color: "var(--ink)",
              background: "var(--hair)",
              border: "1px solid var(--panel-border)",
              borderRadius: "var(--r-control)",
              padding: "0 16px",
              cursor: "pointer",
            }}
          >
            Join
          </button>
        </form>
      </div>
    </div>
  );
}
