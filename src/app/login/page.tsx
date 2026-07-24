"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { ok, data } = await login(email.trim(), password);
    setBusy(false);
    if (!ok) {
      setError(data.error || "Could not log in.");
      return;
    }
    router.push(next);
  }

  return (
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
        <b style={{ fontSize: 16, letterSpacing: "-0.01em" }}>Log in</b>
      </div>

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
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={inputStyle}
      />

      {error && <p style={{ margin: 0, font: "600 12px/1.4 var(--font-ui)", color: "#c0392b" }}>{error}</p>}

      <button type="submit" disabled={busy} style={buttonStyle}>
        {busy ? "Logging in…" : "Log in"}
      </button>

      <p style={{ margin: 0, font: "500 12px/1.6 var(--font-ui)", color: "var(--ink-soft)", textAlign: "center" }}>
        No account? <Link href="/register" style={{ color: "var(--accent)" }}>Sign up</Link>
      </p>
    </form>
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

export default function LoginPage() {
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
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
