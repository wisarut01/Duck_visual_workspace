"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { USER_COLORS } from "@/lib/room";
import { fetchMe, logout, updateProfile, type ApiUser } from "@/lib/api";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(USER_COLORS[3]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe().then(({ ok, data }) => {
      if (!ok || !data.user) {
        router.replace("/login?next=/profile");
        return;
      }
      setUser(data.user);
      setName(data.user.name);
      setColor(data.user.color);
      setLoading(false);
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { ok, data } = await updateProfile(name.trim() || "You", color);
    if (!ok || !data.user) {
      setError(data.error || "Could not save profile.");
      return;
    }
    setUser(data.user);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  }

  async function doLogout() {
    await logout();
    router.push("/login");
  }

  if (loading) return null;

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
      <form
        onSubmit={submit}
        style={{
          width: "min(380px, 100%)",
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
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: color,
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontSize: 20,
              fontWeight: 800,
            }}
          >
            {name[0]?.toUpperCase() ?? "?"}
          </span>
          <div>
            <b style={{ fontSize: 16, letterSpacing: "-0.01em", display: "block" }}>Profile</b>
            <span style={{ font: "500 11px/1.6 var(--font-mono)", color: "var(--ink-faint)" }}>
              {user?.email}
            </span>
          </div>
        </div>

        <div>
          <label
            htmlFor="pname"
            style={{
              font: "600 11px/1 var(--font-mono)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--ink-soft)",
              display: "block",
              marginBottom: 8,
            }}
          >
            Display name
          </label>
          <input
            id="pname"
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

        {error && <p style={{ margin: 0, font: "600 12px/1.4 var(--font-ui)", color: "#c0392b" }}>{error}</p>}

        <button
          type="submit"
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
          {saved ? "Saved ✓" : "Save profile"}
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/dashboard" style={{ font: "600 12px/1 var(--font-ui)", color: "var(--ink-soft)" }}>
            ← Back to my boards
          </Link>
          <button
            type="button"
            onClick={doLogout}
            style={{
              font: "600 12px/1 var(--font-ui)",
              color: "var(--ink-faint)",
              background: "none",
              border: 0,
              cursor: "pointer",
            }}
          >
            Log out
          </button>
        </div>
      </form>
    </div>
  );
}
