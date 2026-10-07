// The registry's own rules: a group is live or mocked as a whole, every path
// names its service, and with no backend configured nothing is live.

import { describe, it, expect, afterEach, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("service registry", () => {
  it("keeps every service in a group on the same status", async () => {
    const { SERVICES } = await import("./backends");
    const byGroup = new Map<string, Set<string>>();
    for (const e of Object.values(SERVICES) as { group?: string; status: string }[]) {
      if (!e.group) continue;
      if (!byGroup.has(e.group)) byGroup.set(e.group, new Set());
      byGroup.get(e.group)!.add(e.status);
    }
    for (const [group, statuses] of byGroup) expect([group, statuses.size]).toEqual([group, 1]);
  });

  it("gives every mocked service a reason to show", async () => {
    const { SERVICES } = await import("./backends");
    for (const [key, e] of Object.entries(SERVICES) as [string, { status: string; reason?: string }][]) {
      if (e.status !== "live") expect([key, !!e.reason]).toEqual([key, true]);
    }
  });

  it("mocks everything when no backend is configured", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    const { SERVICES, isLive, isMock } = await import("./backends");
    for (const key of Object.keys(SERVICES) as (keyof typeof SERVICES)[]) {
      expect(isLive(key)).toBe(false);
      expect(isMock(key)).toBe(true);
    }
  });

  it("with a backend, only live services leave mock data", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    const { isMock } = await import("./backends");
    expect(isMock("auth")).toBe(false);
    expect(isMock("reservation")).toBe(false);
    expect(isMock("portfolio")).toBe(true);
    expect(isMock("estates")).toBe(true);
  });

  it("records mocked services against the page that used them", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    vi.stubGlobal("window", { location: { pathname: "/dashboard" } });
    const { isMock, mockServedOn } = await import("./backends");
    isMock("attention");
    isMock("auth");
    expect(mockServedOn("/dashboard")).toEqual(["attention"]);
    expect(mockServedOn("/elsewhere")).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("names the service behind a request path", async () => {
    const { serviceForPath } = await import("./backends");
    expect(serviceForPath("/api/auth/login")).toBe("auth");
    expect(serviceForPath("/api/portal/estates/e1")).toBe("portalEstates");
    expect(serviceForPath("/api/portal/estates/e1/price-tiers/t1")).toBe("portalInventory");
    expect(serviceForPath("/api/portal/estates/e1/plots?limit=5")).toBe("portalInventory");
    expect(serviceForPath("/api/portal/estates/e1/fees")).toBe("estateDisclosure");
    expect(serviceForPath("/api/marketplace/estates/e1/geojson")).toBe("marketplace");
    expect(serviceForPath("/api/marketplace/enquiries")).toBe("enquiries");
    expect(serviceForPath("/api/nothing")).toBeNull();
  });

  it("checks the page origin against the backend's allowed origins", async () => {
    const { originLooksAllowed } = await import("./backends");
    expect(originLooksAllowed("http://localhost:8443")).toBe(true);
    expect(originLooksAllowed("http://localhost:5173")).toBe(false);
  });
});
