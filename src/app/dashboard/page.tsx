"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMe, listBoards, removeBoard, touchBoard, type ApiBoard, type ApiUser } from "@/lib/api";
import { parseRoomId, randomRoomId } from "@/lib/room";
import ThemeToggle from "@/components/ThemeToggle";

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [boards, setBoards] = useState<ApiBoard[]>([]);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinValue, setJoinValue] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetchMe().then(({ ok, data }) => {
      if (!ok || !data.user) {
        router.replace("/login?next=/dashboard");
        return;
      }
      setUser(data.user);
      setLoading(false);
      listBoards().then(({ data }) => setBoards(data.boards ?? []));
    });
  }, [router]);

  function createBoard() {
    const id = randomRoomId();
    touchBoard(id, "Untitled board").then(({ data }) => setBoards(data.boards ?? []));
    router.push(`/board/${id}`);
  }

  function onRemove(id: string) {
    removeBoard(id).then(({ data }) => setBoards(data.boards ?? []));
  }

  function joinBoard(e: React.FormEvent) {
    e.preventDefault();
    const id = parseRoomId(joinValue);
    if (!id) return;
    setJoining(true);
    touchBoard(id).then(() => router.push(`/board/${id}`));
  }

  if (loading || !user) return null;

  return (
    <div
      style={{
        minHeight: "100%",
        backgroundColor: "var(--bg)",
        backgroundImage: "radial-gradient(var(--dot) 1.4px, transparent 1.4px)",
        backgroundSize: "26px 26px",
        padding: "28px 20px 60px",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", color: "inherit" }}>
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
          </Link>

          <div style={{ flex: 1 }} />

          <ThemeToggle />

          <Link
            href="/profile"
            title="Edit profile"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
              padding: "6px 12px 6px 6px",
              background: "var(--panel)",
              border: "1px solid var(--panel-border)",
              borderRadius: "var(--r-panel)",
              boxShadow: "var(--panel-shadow)",
            }}
          >
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: user.color,
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {user.name[0]?.toUpperCase() ?? "?"}
            </span>
            <span style={{ font: "600 13px/1 var(--font-ui)", color: "var(--ink)" }}>{user.name}</span>
          </Link>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ margin: 0, font: "700 22px/1.2 var(--font-ui)", letterSpacing: "-0.01em", color: "var(--ink)" }}>
            My boards
          </h1>
          <span style={{ font: "500 12px/1 var(--font-mono)", color: "var(--ink-faint)" }}>
            {boards.length} board{boards.length === 1 ? "" : "s"}
          </span>
        </div>

        <form
          onSubmit={joinBoard}
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 24,
          }}
        >
          <input
            value={joinValue}
            onChange={(e) => setJoinValue(e.target.value)}
            placeholder="Paste a board link or id to join…"
            spellCheck={false}
            style={{
              flex: 1,
              font: "500 13px/1.3 var(--font-ui)",
              color: "var(--ink)",
              background: "var(--panel)",
              border: "1px solid var(--panel-border)",
              borderRadius: "var(--r-control)",
              padding: "9px 12px",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={!joinValue.trim() || joining}
            style={{
              font: "600 13px/1 var(--font-ui)",
              color: "var(--accent)",
              background: "var(--panel)",
              border: "1px solid var(--panel-border)",
              borderRadius: "var(--r-control)",
              padding: "0 16px",
              cursor: joinValue.trim() && !joining ? "pointer" : "default",
              opacity: joinValue.trim() && !joining ? 1 : 0.6,
            }}
          >
            Join
          </button>
        </form>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 14,
          }}
        >
          <button
            onClick={createBoard}
            style={{
              height: 132,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "var(--panel)",
              border: "1.5px dashed var(--panel-border)",
              borderRadius: "var(--r-panel)",
              cursor: "pointer",
              color: "var(--ink-soft)",
            }}
          >
            <span style={{ fontSize: 26, lineHeight: 1, color: "var(--accent)" }}>+</span>
            <span style={{ font: "600 13px/1 var(--font-ui)" }}>New board</span>
          </button>

          {boards.map((b) => (
            <div
              key={b.id}
              style={{
                position: "relative",
                background: "var(--panel)",
                border: "1px solid var(--panel-border)",
                borderRadius: "var(--r-panel)",
                boxShadow: "var(--panel-shadow)",
                overflow: "hidden",
              }}
            >
              <Link
                href={`/board/${b.id}`}
                style={{ display: "block", textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    height: 78,
                    backgroundColor: "var(--bg)",
                    backgroundImage: "radial-gradient(var(--dot) 1.2px, transparent 1.2px)",
                    backgroundSize: "16px 16px",
                    borderBottom: "1px solid var(--panel-border)",
                  }}
                />
                <div style={{ padding: "10px 12px 12px" }}>
                  <div
                    style={{
                      font: "600 14px/1.3 var(--font-ui)",
                      color: "var(--ink)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {b.name || b.id}
                  </div>
                  <div style={{ font: "500 11px/1 var(--font-mono)", color: "var(--ink-faint)", marginTop: 5 }}>
                    {timeAgo(b.updated_at)}
                  </div>
                </div>
              </Link>
              <button
                onClick={() => onRemove(b.id)}
                title="Remove from this list"
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 22,
                  height: 22,
                  border: "1px solid var(--panel-border)",
                  borderRadius: 6,
                  background: "var(--panel)",
                  color: "var(--ink-faint)",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {boards.length === 0 && (
          <p style={{ marginTop: 18, font: "500 13px/1.6 var(--font-ui)", color: "var(--ink-faint)" }}>
            No boards yet — create one, or open a board link someone shared with you.
          </p>
        )}
      </div>
    </div>
  );
}
