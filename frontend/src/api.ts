export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const BASE = import.meta.env.VITE_API_URL ?? "";

function messageFrom(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const record = data as { detail?: unknown; errors?: Record<string, unknown> };
    if (typeof record.detail === "string" && record.detail) return record.detail;
    if (record.errors) {
      return Object.entries(record.errors)
        .map(([key, value]) => {
          const text = Array.isArray(value) ? value.join(" ") : String(value);
          return `${key}: ${text}`;
        })
        .join(" ");
    }
  }
  return `The request failed (${status}).`;
}

let refreshing: Promise<boolean> | null = null;

async function refreshAccess(): Promise<boolean> {
  const refresh = localStorage.getItem("vitrine.refresh");
  if (!refresh) return false;
  const response = await fetch(`${BASE}/api/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!response.ok) return false;
  const data = (await response.json()) as { access?: string };
  if (!data.access) return false;
  localStorage.setItem("vitrine.access", data.access);
  return true;
}

function clearSession() {
  localStorage.removeItem("vitrine.access");
  localStorage.removeItem("vitrine.refresh");
  localStorage.removeItem("vitrine.user");
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem("vitrine.access");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  if (response.status === 401 && retry && !path.startsWith("/api/auth/")) {
    refreshing = refreshing ?? refreshAccess().finally(() => {
      refreshing = null;
    });
    const ok = await refreshing;
    if (ok) return api<T>(path, init, false);
    clearSession();
    if (!window.location.pathname.startsWith("/login")) window.location.assign("/login");
    throw new ApiError(401, "Sign in again to continue.");
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) throw new ApiError(response.status, messageFrom(data, response.status));
  return data as T;
}
