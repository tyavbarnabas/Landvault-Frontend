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
// timeouts, cancellation, 401-triggered session renewal from an HttpOnly
// cookie (deduplicated within a tab and serialised across tabs), bounded retries with backoff for transient failures
// only, and structured errors a form can actually surface field-by-field.
//
// See INTEGRATION.md for the full picture of what's wired up vs. still mocked.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const IS_MOCK_MODE = !API_BASE_URL;

const TOKEN_STORAGE_KEY = "auth_token";

// The ACCESS token only. It is short-lived (15 minutes) and still readable by
// script, which is the accepted trade-off: the long-lived credential — the
// refresh token — is an HttpOnly `lv_refresh` cookie the backend sets and this
// code never sees, reads, stores or sends by hand. The browser attaches it to
// /api/auth/refresh and /api/auth/logout (the cookie's Path) on its own.
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

const REFRESH_PATH = "/api/auth/refresh";
const LOGOUT_PATH = "/api/auth/logout";
// One name across every tab of this origin — see withSessionLock.
const SESSION_LOCK = "lv-refresh";

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

// ─── Session: refresh, restore, logout ──────────────────────────────────────
//
// The refresh token is an HttpOnly cookie, so refresh and logout take no body:
// `credentials: "include"` is what makes the browser send it. Login, register,
// 2FA verify and change-password need `credentials: "include"` too — without
// it the browser discards their Set-Cookie outright, refresh has nothing to
// send, and the symptom looks exactly like refresh being broken.

// What a refresh can come back with. `user` is the same AuthUser login
// returns (typed loosely here only because authService imports this module).
export type RefreshOutcome =
  | { kind: "refreshed"; token: string; user: unknown }
  // Another tab refreshed while this one waited for the lock. Its token is
  // already in storage (localStorage is shared across tabs), so nothing is sent.
  | { kind: "reused"; token: string }
  // REFRESH_TOKEN_MISSING (never signed in on this browser), INVALID_REFRESH_TOKEN
  // (session ended — including theft detection revoking every session), or a
  // 403 account/tenant refusal. All mean: sign out cleanly, never retry.
  | { kind: "signed_out"; code: string; message?: string }
  // CONFIGURATION, not an expired session: this page's origin is not in the
  // backend's CORS_ALLOWED_ORIGINS. Two shapes: a readable 403
  // ORIGIN_NOT_ALLOWED, or — far more often, because Spring's CORS check
  // rejects a foreign origin before the Origin guard runs — no readable
  // response at all ("Failed to fetch"). The second is indistinguishable
  // from being offline, and is reported as such.
  | { kind: "origin_not_allowed" }
  | { kind: "unreachable" };

// Cross-tab serialisation. Two tabs whose access tokens expire together would
// both present the same cookie: one refresh rotates it, the other presents a
// now-used token. The server's 10-second grace window keeps that from signing
// anyone out, but the lock is the real fix. navigator.locks needs a secure
// context — present on localhost and https, ABSENT on a LAN IP over http (a
// phone on the dev server) and in Node — so without it this falls back to
// the per-tab single-flight below, and the grace window covers the rest.
async function withSessionLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (!locks?.request) return fn();
  return locks.request(SESSION_LOCK, fn) as Promise<T>;
}

// Per tab: every 401 that lands while a refresh is running waits on the same
// promise rather than starting its own.
let refreshInFlight: Promise<RefreshOutcome> | null = null;

/**
 * Renews the session from the cookie.
 *
 * `staleToken` is the access token the caller just saw rejected. If the stored
 * token has moved on by the time this tab holds the lock, another tab already
 * refreshed, and its token is reused rather than refreshing a second time.
 * Pass null to always refresh — the startup restore does, because it needs
 * the user back as well as a token.
 *
 * Never retries. The refresh call is a plain fetch, not `request()`, so a
 * failed refresh cannot trigger another refresh.
 */
export function refreshSession(staleToken: string | null): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = withSessionLock(async (): Promise<RefreshOutcome> => {
    const current = getAuthToken();
    if (staleToken !== null && current !== null && current !== staleToken) return { kind: "reused", token: current };

    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}${REFRESH_PATH}`, { method: "POST", credentials: "include" });
    } catch {
      return { kind: "unreachable" };
    }
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { token?: string; user?: unknown } | null;
      if (!data?.token) return { kind: "signed_out", code: "MALFORMED_REFRESH_RESPONSE" };
      setAuthToken(data.token);
      return { kind: "refreshed", token: data.token, user: data.user };
    }
    const { message, body } = await parseErrorBody(res);
    if (res.status === 403 && body?.code === "ORIGIN_NOT_ALLOWED") return { kind: "origin_not_allowed" };
    return { kind: "signed_out", code: body?.code ?? `HTTP_${res.status}`, message };
  }).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

// Lets AppContext hear about session changes that happen inside a request —
// a silent renewal (fresh user: permissions and flags change server-side), a
// clean sign-out, or a configuration problem.
export type SessionEvent =
  | { kind: "refreshed"; user: unknown }
  | { kind: "signed_out"; code: string; message?: string }
  | { kind: "config_problem"; problem: "origin_not_allowed" | "unreachable" };

type SessionListener = (event: SessionEvent) => void;
const sessionListeners = new Set<SessionListener>();

export function onSessionEvent(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}

function emit(event: SessionEvent): void {
  for (const listener of sessionListeners) listener(event);
}

/**
 * Ends THIS browser's session: the server revokes this cookie's token (other
 * devices stay signed in) and clears the cookie, then the access token is
 * dropped here. Dropping it matters — it still works server-side for up to 15
 * minutes. Taken under the same lock as refresh, so a logout can never
 * interleave with a refresh in flight in another tab. The token is dropped
 * even if the call fails: signing out locally must never depend on the network.
 */
export async function logoutSession(): Promise<void> {
  if (IS_MOCK_MODE) { setAuthToken(null); return; }
  await withSessionLock(async () => {
    try {
      await fetch(`${API_BASE_URL}${LOGOUT_PATH}`, { method: "POST", credentials: "include" });
    } catch {
      // Offline or refused — still signed out here.
    } finally {
      setAuthToken(null);
    }
  });
}

/** Thrown when a request can't proceed because the session can't be renewed
 * for a CONFIGURATION reason — distinct from an expired session, so nobody
 * goes chasing the wrong problem. */
export class SessionConfigError extends Error {
  problem: "origin_not_allowed" | "unreachable";
  constructor(problem: "origin_not_allowed" | "unreachable") {
    super(problem === "origin_not_allowed"
      ? "This page's origin isn't in the backend's CORS_ALLOWED_ORIGINS, so the session can't be renewed."
      : "Couldn't reach the server to renew the session.");
    this.name = "SessionConfigError";
    this.problem = problem;
  }
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
  /** Set on every call whose response sets or clears the `lv_refresh` cookie
   * (login, register, 2FA verify, change-password) — see the session section.
   * Passed straight through to fetch via RequestInit. */
  credentials?: RequestCredentials;
  /** Required to retry a non-idempotent request (POST/PUT/DELETE) safely —
   * without one, POST/DELETE are never retried even on a 5xx or network
   * error, since the server may have already applied the first attempt. */
  idempotencyKey?: string;
  /** For the few endpoints where a 401 is the ANSWER, not an expired session —
   * change-password returns 401 for a wrong current password. Without this,
   * a mistyped password would be taken as a dead session: a refresh attempt,
   * and possibly a sign-out. Login and 2FA verify pass it for the same reason. The 401 is thrown as an
   * ordinary ApiError instead, carrying the server's code. */
  skipAuthRefresh?: boolean;
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

  const { timeoutMs = DEFAULT_TIMEOUT_MS, idempotencyKey, skipAuthRefresh, _retriedAfterRefresh, signal: callerSignal, ...init } = options;
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
        // A FormData body (a file upload) must NOT carry a Content-Type: the
        // browser sets multipart/form-data itself, with the boundary in it.
        ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
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

  // A request that carried NO access token has no session to renew — a
  // refresh here would only ask again for what just failed. That, plus the
  // single retry below, is what stops one dead session becoming a loop.
  if (res.status === 401 && token && !_retriedAfterRefresh && !skipAuthRefresh) {
    const outcome = await refreshSession(token);
    if (outcome.kind === "refreshed" || outcome.kind === "reused") {
      if (outcome.kind === "refreshed") emit({ kind: "refreshed", user: outcome.user });
      return request<T>(path, { ...options, _retriedAfterRefresh: true }, attempt);
    }
    if (outcome.kind === "origin_not_allowed" || outcome.kind === "unreachable") {
      // Not signed out: the session may be fine once this is fixed.
      emit({ kind: "config_problem", problem: outcome.kind });
      throw new SessionConfigError(outcome.kind);
    }
    setAuthToken(null);
    emit({ kind: "signed_out", code: outcome.code, message: outcome.message });
    throw new ApiError(401, "Session ended.", { code: outcome.code, message: outcome.message });
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
  // multipart/form-data — a file upload. Sent as-is, never JSON-encoded.
  postForm: <T>(path: string, form: FormData, options?: RequestOptions) => request<T>(path, { ...options, method: "POST", body: form }),
};
