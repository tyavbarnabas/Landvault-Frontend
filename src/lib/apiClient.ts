// ─── API client ─────────────────────────────────────────────────────────────
//
// Thin fetch wrapper the backend integration hangs off. When VITE_API_BASE_URL
// is unset (the default — see .env.example), the app runs in "mock mode": every
// service in src/services/ falls back to the bundled mock data instead of
// calling this client. Once a real backend exists, set VITE_API_BASE_URL and
// each service starts issuing real requests through the same functions its
// components already call — no component changes needed.
//
// See INTEGRATION.md for the full picture of what's wired up vs. still mocked.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const IS_MOCK_MODE = !API_BASE_URL;

const TOKEN_STORAGE_KEY = "auth_token";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (IS_MOCK_MODE) {
    // Services should branch on IS_MOCK_MODE before reaching here — this is a
    // guard against a service accidentally calling the client in mock mode.
    throw new Error(`apiClient called for "${path}" with no VITE_API_BASE_URL set. Set it in .env, or fix the calling service's mock-mode branch.`);
  }

  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiClient = {
  isMockMode: IS_MOCK_MODE,
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
