// Client-side wrapper around the epic 7 auth/boards API routes.
export interface ApiUser {
  id: string;
  email: string;
  name: string;
  color: string;
}

export interface ApiBoard {
  id: string;
  owner_id: string;
  name: string;
  updated_at: number;
}

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export function fetchMe() {
  return call<{ user: ApiUser | null; error?: string }>("/api/auth/me");
}

export function login(email: string, password: string) {
  return call<{ user?: ApiUser; error?: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(email: string, password: string, name: string, color: string) {
  return call<{ user?: ApiUser; error?: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name, color }),
  });
}

export function logout() {
  return call<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function updateProfile(name: string, color: string) {
  return call<{ user?: ApiUser; error?: string }>("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ name, color }),
  });
}

export function listBoards() {
  return call<{ boards?: ApiBoard[]; error?: string }>("/api/boards");
}

export function touchBoard(id: string, name?: string) {
  return call<{ boards?: ApiBoard[]; error?: string }>("/api/boards", {
    method: "POST",
    body: JSON.stringify({ id, name }),
  });
}

export function removeBoard(id: string) {
  return call<{ boards?: ApiBoard[]; error?: string }>(`/api/boards/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// F1a: image upload. Deliberately bypasses `call()` above — that helper
// always sets `Content-Type: application/json`, which is wrong for a
// multipart body (the browser must set its own `Content-Type` with the
// multipart boundary for a FormData body; setting it manually breaks parsing).
export interface UploadImageResult {
  url?: string;
  width?: number | null;
  height?: number | null;
  error?: string;
}
export async function uploadImage(file: File): Promise<{ ok: boolean; status: number; data: UploadImageResult }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: formData });
  const data = (await res.json().catch(() => ({}))) as UploadImageResult;
  return { ok: res.ok, status: res.status, data };
}
