"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { USER_COLORS } from "@/lib/room";
import { register } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [color, setColor] = useState<string>(USER_COLORS[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { ok, data } = await register(email.trim(), password, name.trim(), color);
    setBusy(false);
    if (!ok) {
      setError(data.error || "Could not create account.");
      return;
    }
    router.push("/dashboard");
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
          gap: 18,
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
          <b style={{ fontSize: 16, letterSpacing: "-0.01em" }}>Sign up</b>
          <div style={{ marginLeft: "auto" }}>
            <ThemeToggle />
          </div>
        </div>

        <input
          type="text"
          placeholder="Name"
          value={name}
          maxLength={16}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          required
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

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

        {error && <p style={{ margin: 0, font: "600 12px/1.4 var(--font-ui)", color: "var(--danger)" }}>{error}</p>}

        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? "Creating account…" : "Create account"}
        </button>

        <p style={{ margin: 0, font: "500 12px/1.6 var(--font-ui)", color: "var(--ink-soft)", textAlign: "center" }}>
          Already have an account? <Link href="/login" style={{ color: "var(--accent)" }}>Log in</Link>
        </p>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  font: "500 14px/1.3 var(--font-ui)",
  color: "var(--ink)",
  background: "var(--bg)",
  border: "1px solid var(--panel-border)",
  borderRadius: "var(--r-control)",
  padding: "10px 12px",
  outline: "none",
};

const buttonStyle: React.CSSProperties = {
  font: "600 14px/1 var(--font-ui)",
  color: "#fff",
  background: "var(--accent)",
  border: 0,
  borderRadius: "var(--r-control)",
  padding: 12,
  cursor: "pointer",
};
