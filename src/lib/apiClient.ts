// ─── API client ─────────────────────────────────────────────────────────────
//
// Thin fetch wrapper the backend integration hangs off. When VITE_API_BASE_URL
// is unset (the default — see .env.example), the app runs in "mock mode": every
// service in src/services/ falls back to the bundled mock data instead of
// calling this client. Once a real backend exists, set VITE_API_BASE_URL and
// each service starts issuing real requests through the same functions its
// components already call — no component changes needed.
//
// Hardened for a real (and specifically a real Nigerian mobile) network:
// timeouts, cancellation, 401-triggered token refresh (deduplicated across
// concurrent requests), bounded retries with backoff for transient failures
// only, and structured errors a form can actually surface field-by-field.
//
// See INTEGRATION.md for the full picture of what's wired up vs. still mocked.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const IS_MOCK_MODE = !API_BASE_URL;

const TOKEN_STORAGE_KEY = "auth_token";

// TODO (backend): a token readable by any script on the page is a real XSS
// exposure. Moving it to an httpOnly cookie is the fix, but that depends on
// the backend's cookie/CORS/CSRF decisions (SameSite policy, a CSRF token
// scheme, which domains the API actually serves from) — not something to
// guess at from the frontend alone. Left as localStorage, flagged plainly,
// rather than half-migrating the storage mechanism now.
export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export interface ApiErrorBody {
  message?: string;
  code?: string;
  fieldErrors?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  /** Parsed JSON error body, when the server returned one — lets a form
   * surface field-level errors instead of a raw string. */
  body?: ApiErrorBody;
  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class ApiTimeoutError extends Error {
  constructor(path: string) {
    super(`Request to "${path}" timed out.`);
    this.name = "ApiTimeoutError";
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

// TODO (backend): the real refresh endpoint path — adjust once known. Must
// accept the current (expired) access token's refresh token (however the
// backend chooses to hand it over: a second stored token, or an httpOnly
// cookie the browser sends automatically) and return a new access token.
const REFRESH_PATH = "/api/auth/refresh";

function isIdempotent(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "PUT" || method === "DELETE";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exponential backoff with jitter — never hammer a struggling server in lockstep.
function backoffDelay(attempt: number): number {
  const exp = RETRY_BASE_DELAY_MS * 2 ** attempt;
  return exp / 2 + Math.random() * (exp / 2);
}

// ─── 401 handling: single-flight refresh ────────────────────────────────────
//
// Several requests can 401 at once (a page firing off Promise.all of several
// fetches right as the token expires). Only one refresh should ever be in
// flight — every 401 that lands while one is already running waits on the
// same promise rather than each kicking off its own.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}${REFRESH_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // in case refresh rides on an httpOnly cookie
      });
      if (!res.ok) return false;
      const data = (await res.json().catch(() => null)) as { token?: string } | null;
      if (!data?.token) return false;
      setAuthToken(data.token);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function redirectToLogin(): void {
  setAuthToken(null);
  const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/login?returnUrl=${returnUrl}`);
}

async function parseErrorBody(res: Response): Promise<{ message: string; body?: ApiErrorBody }> {
  const text = await res.text().catch(() => "");
  if (!text) return { message: res.statusText };
  try {
    const parsed = JSON.parse(text) as ApiErrorBody;
    return { message: parsed.message ?? res.statusText, body: parsed };
  } catch {
    return { message: text };
  }
}

export interface RequestOptions extends RequestInit {
  /** Overrides the default 20s timeout for this call. */
  timeoutMs?: number;
  /** Lets a caller abort this specific request (e.g. a component unmounting
   * or a newer request superseding a stale one). Composed with the internal
   * timeout's own signal — either firing aborts the request. */
  signal?: AbortSignal;
  /** Required to retry a non-idempotent request (POST/PUT/DELETE) safely —
   * without one, POST/DELETE are never retried even on a 5xx or network
   * error, since the server may have already applied the first attempt. */
  idempotencyKey?: string;
  /** Internal — set on the recursive retry-after-refresh call so a second
   * 401 doesn't loop forever. */
  _retriedAfterRefresh?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}, attempt = 0): Promise<T> {
  if (IS_MOCK_MODE) {
    // Services should branch on IS_MOCK_MODE before reaching here — this is a
    // guard against a service accidentally calling the client in mock mode.
    throw new Error(`apiClient called for "${path}" with no VITE_API_BASE_URL set. Set it in .env, or fix the calling service's mock-mode branch.`);
  }

  const { timeoutMs = DEFAULT_TIMEOUT_MS, idempotencyKey, _retriedAfterRefresh, signal: callerSignal, ...init } = options;
  const method = (init.method ?? "GET").toUpperCase();

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  // Compose the caller's own abort signal (if any) with the timeout's.
  const onCallerAbort = () => timeoutController.abort();
  callerSignal?.addEventListener("abort", onCallerAbort);

  const token = getAuthToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: timeoutController.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...init.headers,
      },
    });
  } catch (err) {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", onCallerAbort);

    if (callerSignal?.aborted) throw err; // caller-initiated cancellation — never retried, never rewritten
    if (timeoutController.signal.aborted) {
      if (attempt < MAX_RETRIES && (isIdempotent(method) || idempotencyKey)) {
        await sleep(backoffDelay(attempt));
        return request<T>(path, options, attempt + 1);
      }
      throw new ApiTimeoutError(path);
    }
    // Network error (offline, DNS, connection reset, ...) — retry the same
    // way a 5xx is retried below.
    if (attempt < MAX_RETRIES && (isIdempotent(method) || idempotencyKey)) {
      await sleep(backoffDelay(attempt));
      return request<T>(path, options, attempt + 1);
    }
    throw err;
  }
  clearTimeout(timeoutId);
  callerSignal?.removeEventListener("abort", onCallerAbort);

  if (res.status === 401 && !_retriedAfterRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, { ...options, _retriedAfterRefresh: true }, attempt);
    redirectToLogin();
    throw new ApiError(401, "Session expired.");
  }

  if (!res.ok) {
    // 5xx is transient-failure territory — retry with backoff, same
    // idempotency rule as a network error. Never retry a 4xx: that's the
    // server telling us the request itself is wrong, not that it's a bad
    // moment to ask.
    if (res.status >= 500 && attempt < MAX_RETRIES && (isIdempotent(method) || idempotencyKey)) {
      await sleep(backoffDelay(attempt));
      return request<T>(path, options, attempt + 1);
    }
    const { message, body } = await parseErrorBody(res);
    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiClient = {
  isMockMode: IS_MOCK_MODE,
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, { ...options, method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, { ...options, method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "DELETE" }),
};
