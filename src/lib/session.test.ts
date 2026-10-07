// The refresh-cookie session, against a stubbed fetch — the real-mode branch
// that mock mode never exercises. Responses are transcribed from
// AuthController, TwoFactorController and AuthExceptionHandler (backend
// commits 91024a3 and cf8983e).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type Call = { path: string; method: string; body: unknown; auth: string | null; credentials: RequestCredentials | undefined };
type Reply = { status: number; body?: unknown } | "network-error" | (() => Promise<{ status: number; body?: unknown }>);

let calls: Call[];
let store: Map<string, string>;
let lockNames: string[];

const USER = { name: "Ada", email: "ada@estintin.com", role: "client", permissions: ["portal.estates.view"], tenantId: "t", branchId: null };

function respond(routes: Record<string, Reply | Reply[]>) {
  const queues = new Map(Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace("http://api.test", "");
    const method = (init.method ?? "GET").toUpperCase();
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ path, method, body: init.body ? JSON.parse(String(init.body)) : undefined, auth: headers.Authorization ?? null, credentials: init.credentials });
    const queue = queues.get(`${method} ${path}`);
    // The last reply repeats, so "always 401" is one entry.
    const reply = queue ? (queue.length > 1 ? queue.shift()! : queue[0]) : { status: 404, body: { code: "NOT_FOUND" } };
    if (reply === "network-error") throw new TypeError("Failed to fetch");
    const { status, body } = typeof reply === "function" ? await reply() : reply;
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }));
}

// A real queue, like the browser's: a second request for the same name waits
// until the first callback settles.
function stubLocks() {
  const tails = new Map<string, Promise<unknown>>();
  vi.stubGlobal("navigator", {
    locks: {
      request: (name: string, fn: () => Promise<unknown>) => {
        lockNames.push(name);
        const run = (tails.get(name) ?? Promise.resolve()).then(fn, fn);
        tails.set(name, run.catch(() => undefined));
        return run;
      },
    },
  });
}

beforeEach(() => {
  calls = [];
  lockNames = [];
  store = new Map([["auth_token", "access-1"]]);
  vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  stubLocks();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("restoring a session on page load", () => {
  it("one refresh — no body, the cookie via credentials: include — restores { user, token }", async () => {
    respond({ "POST /api/auth/refresh": { status: 200, body: { user: USER, token: "access-2" } } });
    const { restoreSession } = await import("../services/authService");

    const outcome = await restoreSession();

    expect(outcome).toEqual({ kind: "signed_in", user: USER });
    expect(calls).toEqual([{ path: "/api/auth/refresh", method: "POST", body: undefined, auth: null, credentials: "include" }]);
    expect(store.get("auth_token")).toBe("access-2");
    expect(lockNames).toEqual(["lv-refresh"]);
  });

  it("a refresh that returns no user (an older backend) restores nobody rather than an empty session", async () => {
    respond({ "POST /api/auth/refresh": { status: 200, body: { token: "access-2" } } });
    const { restoreSession } = await import("../services/authService");

    expect(await restoreSession()).toEqual({ kind: "signed_out", code: "NO_USER" });
  });

  it("REFRESH_TOKEN_MISSING means nobody is signed in here — one call, no retry, no notice", async () => {
    respond({ "POST /api/auth/refresh": { status: 401, body: { code: "REFRESH_TOKEN_MISSING", message: "No session to refresh. Sign in." } } });
    const { restoreSession, signOutReason } = await import("../services/authService");

    const outcome = await restoreSession();

    expect(outcome).toMatchObject({ kind: "signed_out", code: "REFRESH_TOKEN_MISSING" });
    expect(calls).toHaveLength(1);
    expect(store.has("auth_token")).toBe(false);
    expect(signOutReason("REFRESH_TOKEN_MISSING")).toBeNull();
  });

  it.each(["ACCOUNT_SUSPENDED", "ACCOUNT_DEACTIVATED", "TENANT_NOT_ACTIVE"])(
    "a 403 %s signs out with the reason, not as an expired session", async (code) => {
      respond({ "POST /api/auth/refresh": { status: 403, body: { code, message: "…" } } });
      const { restoreSession, signOutReason } = await import("../services/authService");

      expect(await restoreSession()).toMatchObject({ kind: "signed_out", code });
      expect(signOutReason(code)).toMatch(/suspended|deactivated|organisation/);
    });

  it("a readable 403 ORIGIN_NOT_ALLOWED is a configuration problem, and keeps the token", async () => {
    respond({ "POST /api/auth/refresh": { status: 403, body: { code: "ORIGIN_NOT_ALLOWED" } } });
    const { restoreSession } = await import("../services/authService");

    expect(await restoreSession()).toEqual({ kind: "config_problem", problem: "origin_not_allowed" });
    expect(store.get("auth_token")).toBe("access-1");
  });

  it("no readable response at all — what a CORS-refused origin looks like — is not a sign-out either", async () => {
    respond({ "POST /api/auth/refresh": "network-error" });
    const { restoreSession } = await import("../services/authService");

    expect(await restoreSession()).toEqual({ kind: "config_problem", problem: "unreachable" });
    expect(store.get("auth_token")).toBe("access-1");
  });
});

describe("renewing silently when the access token expires", () => {
  it("a 401 refreshes once, retries with the new token, and hands the fresh user on", async () => {
    respond({
      "GET /api/me/attention": [{ status: 401 }, { status: 200, body: [] }],
      "POST /api/auth/refresh": { status: 200, body: { user: USER, token: "access-2" } },
    });
    const { apiClient, onSessionEvent } = await import("./apiClient");
    const events: unknown[] = [];
    onSessionEvent((e) => events.push(e));

    await expect(apiClient.get("/api/me/attention")).resolves.toEqual([]);

    expect(calls.map((c) => `${c.method} ${c.path} ${c.auth ?? ""}`)).toEqual([
      "GET /api/me/attention Bearer access-1",
      "POST /api/auth/refresh ",
      "GET /api/me/attention Bearer access-2",
    ]);
    expect(events).toEqual([{ kind: "refreshed", user: USER }]);
  });

  it("a failed refresh signs out cleanly: no retry, no second refresh, no loop", async () => {
    respond({
      "GET /api/me/attention": { status: 401 },
      "POST /api/auth/refresh": { status: 401, body: { code: "INVALID_REFRESH_TOKEN" } },
    });
    const { apiClient, onSessionEvent } = await import("./apiClient");
    const events: unknown[] = [];
    onSessionEvent((e) => events.push(e));

    const err = await apiClient.get("/api/me/attention").catch((e) => e);
    // And once signed out, another request carries no token, so it cannot
    // start a refresh at all.
    await apiClient.get("/api/me/attention").catch(() => undefined);

    expect(err).toMatchObject({ status: 401, body: { code: "INVALID_REFRESH_TOKEN" } });
    expect(calls.filter((c) => c.path === "/api/auth/refresh")).toHaveLength(1);
    expect(store.has("auth_token")).toBe(false);
    expect(events).toEqual([{ kind: "signed_out", code: "INVALID_REFRESH_TOKEN", message: expect.any(String) }]);
  });

  it("a configuration failure during renewal is reported as such and signs nobody out", async () => {
    respond({ "GET /api/me/attention": { status: 401 }, "POST /api/auth/refresh": "network-error" });
    const { apiClient, SessionConfigError } = await import("./apiClient");

    const err = (await apiClient.get("/api/me/attention").catch((e) => e)) as InstanceType<typeof SessionConfigError>;

    expect(err).toBeInstanceOf(SessionConfigError);
    expect(err.problem).toBe("unreachable");
    expect(store.get("auth_token")).toBe("access-1");
  });
});

describe("across tabs", () => {
  it("a tab that waited for the lock reuses the token another tab already refreshed", async () => {
    respond({ "POST /api/auth/refresh": { status: 200, body: { user: USER, token: "never" } } });
    const { refreshSession } = await import("./apiClient");
    // Another tab refreshed while this one waited: shared localStorage moved on.
    store.set("auth_token", "access-from-other-tab");

    expect(await refreshSession("access-1")).toEqual({ kind: "reused", token: "access-from-other-tab" });
    expect(calls).toHaveLength(0);
  });

  it("logout takes the same lock, so it cannot interleave with a refresh in flight", async () => {
    let finishRefresh!: () => void;
    respond({
      "POST /api/auth/refresh": () => new Promise((resolve) => { finishRefresh = () => resolve({ status: 200, body: { user: USER, token: "access-2" } }); }),
      "POST /api/auth/logout": { status: 204 },
    });
    const { refreshSession, logoutSession } = await import("./apiClient");

    const refreshing = refreshSession(null);
    const loggingOut = logoutSession();
    await new Promise((r) => setTimeout(r, 10));
    // Logout is queued behind the refresh — it has not been sent.
    expect(calls.map((c) => c.path)).toEqual(["/api/auth/refresh"]);

    finishRefresh();
    await Promise.all([refreshing, loggingOut]);
    expect(calls.map((c) => c.path)).toEqual(["/api/auth/refresh", "/api/auth/logout"]);
    expect(lockNames).toEqual(["lv-refresh", "lv-refresh"]);
    // Logout ran last, so no token survives it.
    expect(store.has("auth_token")).toBe(false);
  });

  it("without navigator.locks (a LAN IP over http, or Node) refresh still works, per tab", async () => {
    vi.stubGlobal("navigator", {});
    respond({ "POST /api/auth/refresh": { status: 200, body: { user: USER, token: "access-2" } } });
    const { refreshSession } = await import("./apiClient");

    expect(await refreshSession(null)).toMatchObject({ kind: "refreshed", token: "access-2" });
  });
});

describe("logout", () => {
  it("POSTs with no body and the cookie, then drops the access token", async () => {
    respond({ "POST /api/auth/logout": { status: 204 } });
    const { logout } = await import("../services/authService");

    await logout();

    expect(calls).toEqual([{ path: "/api/auth/logout", method: "POST", body: undefined, auth: null, credentials: "include" }]);
    expect(store.has("auth_token")).toBe(false);
  });

  it("drops the access token even when the call fails — signing out never depends on the network", async () => {
    respond({ "POST /api/auth/logout": "network-error" });
    const { logout } = await import("../services/authService");

    await logout();
    expect(store.has("auth_token")).toBe(false);
  });
});

describe("calls that set the cookie, and 401s that are answers", () => {
  it("login sends credentials: include, and a wrong password is 'wrong password' — no refresh, no sign-out", async () => {
    respond({ "POST /api/auth/login": { status: 401, body: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } } });
    const { login, errorCodeOf } = await import("../services/authService");

    const err = await login("ada@estintin.com", "typo").catch((e) => e);

    expect(errorCodeOf(err)).toBe("INVALID_CREDENTIALS");
    expect(calls.map((c) => [c.path, c.credentials])).toEqual([["/api/auth/login", "include"]]);
    expect(store.get("auth_token")).toBe("access-1");
  });

  it("login stores the access token and nothing else", async () => {
    respond({ "POST /api/auth/login": { status: 200, body: { user: USER, token: "access-2" } } });
    const { login } = await import("../services/authService");

    await login("ada@estintin.com", "right");
    expect([...store.entries()]).toEqual([["auth_token", "access-2"]]);
  });

  it("2FA verify: credentials: include, and a wrong code is an answer", async () => {
    respond({ "POST /api/auth/2fa/verify": { status: 401, body: { code: "INVALID_TWO_FACTOR_CODE" } } });
    const { verifyTwoFactor, errorCodeOf } = await import("../services/authService");

    const err = await verifyTwoFactor("chal_x", "000000").catch((e) => e);
    expect(errorCodeOf(err)).toBe("INVALID_TWO_FACTOR_CODE");
    expect(calls.map((c) => [c.path, c.credentials])).toEqual([["/api/auth/2fa/verify", "include"]]);
  });

  it("register and change-password send credentials: include so their Set-Cookie is kept", async () => {
    respond({
      "POST /api/auth/register": { status: 201, body: { user: USER, token: "access-2" } },
      "POST /api/auth/change-password": { status: 200, body: { message: "ok" } },
    });
    const { register, changePassword } = await import("../services/authService");

    await register({ firstName: "Ada", lastName: "Obi", email: "a@b.c", phone: "1", password: "pw-12345678", country: "NG", currency: "NGN" });
    await changePassword({ currentPassword: "a", newPassword: "b" }, "a@b.c");
    expect(calls.map((c) => c.credentials)).toEqual(["include", "include"]);
  });

  it("register sends exactly RegisterRequest's fields — the backend rejects unknown ones", async () => {
    respond({ "POST /api/auth/register": { status: 201, body: { user: USER, token: "access-2" } } });
    const { register } = await import("../services/authService");
    await register({ firstName: "Ada", lastName: "Obi", email: "a@b.c", phone: "1", password: "pw-12345678", country: "NG", currency: "NGN" });
    expect(Object.keys(calls[0].body as object).sort()).toEqual(["country", "currency", "email", "firstName", "lastName", "password", "phone"]);
  });
});

describe("the frontend never handles the refresh token", () => {
  it("no source file mentions refreshToken", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) && readFileSync(path, "utf8").includes("refreshToken")) offenders.push(path);
      }
    };
    walk(join(__dirname, ".."));
    expect(offenders).toEqual([]);
  });
});
