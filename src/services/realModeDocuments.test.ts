// Real-mode contract tests for the document vault. Responses are transcribed
// from the backend's DocumentDto (live dev run, 2026-10-19). Documents are
// read-only there: live mode must never call a void or issue route, and the
// files must go through the client with the bearer token.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Call = { url: string; method: string; auth: string | null };
let calls: Call[];

function respond(routes: Record<string, { status: number; body?: unknown; blob?: Blob }>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace("http://api.test", "");
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ url: path, method, auth: (init.headers as Record<string, string> | undefined)?.Authorization ?? null });
    const hit = routes[`${method} ${path}`];
    if (!hit) return new Response(JSON.stringify({ message: "No such route", code: "NOT_FOUND" }), { status: 404 });
    if (hit.blob) return new Response(hit.blob, { status: hit.status, headers: { "Content-Type": hit.blob.type } });
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
  vi.stubGlobal("window", { location: { pathname: "/documents", search: "", assign: vi.fn() } });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const RECEIPT_ID = "437c005a-eff1-459f-81af-af9d25a76822";
const receiptDto = {
  id: RECEIPT_ID, type: "receipt", title: "Receipt HT-RCT-2026-000010 — Block B, Plot 15, Lugbe Demo Gardens",
  number: "HT-RCT-2026-000010", date: "2026-10-16", issuedAt: "2026-10-16T16:29:52.592413Z", status: "valid",
  qrCode: "9368-19E1-9BDF-BC9F", verifyUrl: "http://localhost:8443/verify/936819E19BDFBC9F", size: null,
  plotId: "00257f87-7462-4fca-a7cb-5ac460cef144", transactionId: "f6288025-80dc-4e9d-8bce-d91844ec804d",
  supersedes: null, refundedAt: null,
  pdfUrl: `/api/documents/receipts/${RECEIPT_ID}/pdf`, jpegUrl: `/api/documents/receipts/${RECEIPT_ID}/jpeg`,
};

describe("the vault, live", () => {
  it("pages without sending an empty cursor", async () => {
    respond({
      "GET /api/documents": { status: 200, body: { items: [receiptDto], total: 2, cursor: "1", hasMore: true } },
      "GET /api/documents?cursor=1": { status: 200, body: { items: [], total: 2, cursor: null, hasMore: false } },
    });
    const { fetchDocuments } = await import("./documentsService");
    const first = await fetchDocuments();
    expect(first.items[0]).toMatchObject({ number: "HT-RCT-2026-000010", qrCode: "9368-19E1-9BDF-BC9F", status: "valid" });
    await fetchDocuments({ cursor: first.cursor ?? undefined });
    expect(calls.map((c) => c.url)).toEqual(["/api/documents", "/api/documents?cursor=1"]);
  });

  it("downloads a file with the token, named as the server names it", async () => {
    respond({ [`GET ${receiptDto.pdfUrl}`]: { status: 200, blob: new Blob(["%PDF-1.6"], { type: "application/pdf" }) } });
    const { fetchDocumentFile } = await import("./documentsService");
    const file = await fetchDocumentFile(receiptDto as never, "pdf");
    expect(file.name).toBe("HomeTrue-HT-RCT-2026-000010.pdf");
    expect(file.type).toBe("application/pdf");
    expect(await file.text()).toBe("%PDF-1.6");
    expect(calls[0].auth).toBe("Bearer access-1");
  });

  it("a failed download reads the standard error body", async () => {
    respond({});
    const { fetchReceiptFile } = await import("./documentsService");
    await expect(fetchReceiptFile("nope", "HT-RCT-2026-000099")).rejects.toMatchObject({ status: 404 });
  });

  it("voiding and issuing stay in the mock store — the backend has no such routes", async () => {
    respond({});
    const { voidDocument, addDocuments } = await import("./documentsService");
    await voidDocument(RECEIPT_ID);
    await addDocuments([]);
    expect(calls).toEqual([]);
  });
});
