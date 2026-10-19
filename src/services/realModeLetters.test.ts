// Real-mode contract tests for the letter setup: request bodies and routes as
// the backend's controllers take them (changesets 090–094), checked against
// the live dev backend on 2026-10-19.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Call = { url: string; method: string; body: unknown };
let calls: Call[];

function respond(routes: Record<string, { status: number; body?: unknown; blob?: Blob }>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace("http://api.test", "");
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ url: path, method, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined });
    const hit = routes[`${method} ${path}`];
    if (!hit) return new Response(JSON.stringify({ message: "No such route", code: "NOT_FOUND" }), { status: 404 });
    if (hit.blob) return new Response(hit.blob, { status: hit.status });
    return new Response(hit.body === undefined ? null : JSON.stringify(hit.body), { status: hit.status });
  }));
}

beforeEach(() => {
  calls = [];
  const store = new Map([["auth_token", "access-1"]]);
  vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("window", { location: { pathname: "/portal/letters", search: "", assign: vi.fn() } });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ED = { tenantId: "t1", branchId: null };
const E = "72802806-bd0f-4212-be15-d75e4cf61752";
const versions = { terms: 3, companyLetterhead: 3, branchLetterhead: 0, fees: 1, refundTerms: 1, defaultTerms: null, templateSource: "branch", template: 1 };

describe("the letter setup, live", () => {
  it("saves conditions as { clauses } and surfaces CLAUSE_REFUSED per clause", async () => {
    respond({ [`PUT /api/portal/estates/${E}/letter-terms`]: { status: 400, body: {
      message: "Some clauses can't be used as written.", code: "CLAUSE_REFUSED", fieldErrors: { "clauses[4]": "Remove the bank details." },
    } } });
    const { saveLetterTerms, fieldErrorsOf, errorCode } = await import("./lettersService");
    const err = await saveLetterTerms(E, ["a", "b"], ED).catch((e) => e);
    expect(calls[0].body).toEqual({ clauses: ["a", "b"] });
    expect(errorCode(err)).toBe("CLAUSE_REFUSED");
    expect(fieldErrorsOf(err)).toEqual({ "clauses[4]": "Remove the bank details." });
  });

  it("approves with the versions previewed, and previews as a file", async () => {
    respond({
      [`POST /api/portal/estates/${E}/letter-approval`]: { status: 409, body: { message: "Changed.", code: "LETTER_SETUP_CHANGED" } },
      [`GET /api/portal/estates/${E}/letter-preview/jpeg?terms=latest`]: { status: 200, blob: new Blob(["jpg"], { type: "image/jpeg" }) },
    });
    const { approveLetter, fetchLetterPreview, errorCode } = await import("./lettersService");
    const err = await approveLetter(E, versions as never, ED).catch((e) => e);
    expect(calls[0].body).toEqual({ versions });
    expect(errorCode(err)).toBe("LETTER_SETUP_CHANGED");
    const file = await fetchLetterPreview(E, "jpeg", "latest");
    expect(file.type).toBe("image/jpeg");
  });

  it("names a branch-narrowed refusal plainly", async () => {
    respond({ "PUT /api/portal/letterheads/company/signatory": { status: 403, body: { message: "Forbidden", code: "DOCUMENTS_REQUIRE_COMPANY_WIDE_SCOPE" } } });
    const { setSignatory, errorMessage } = await import("./lettersService");
    const err = await setSignatory("company", "A", "B", ED).catch((e) => e);
    expect(calls[0].body).toEqual({ name: "A", title: "B" });
    expect(errorMessage(err)).toMatch(/company-wide view/);
  });

  it("files estate letter routes under the letters service", async () => {
    const { serviceForPath } = await import("../lib/backends");
    expect(serviceForPath(`/api/portal/estates/${E}/letter-terms`)).toBe("letters");
    expect(serviceForPath(`/api/portal/estates/${E}/letter-preview/pdf?terms=approved`)).toBe("letters");
    expect(serviceForPath("/api/portal/letterheads")).toBe("letters");
    expect(serviceForPath(`/api/portal/estates/${E}`)).toBe("portalEstates");
  });
});
