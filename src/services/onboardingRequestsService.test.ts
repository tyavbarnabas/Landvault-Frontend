import { describe, it, expect, afterEach, vi } from "vitest";
import {
  contactLinks, convertRequest, declineRequest, internationalDigits, fetchOnboardingRequest, fetchOnboardingRequests, markContacted, submitOnboardingRequest, wizardPrefill,
  type OnboardingRequest, type OnboardingSubmission,
} from "./onboardingRequestsService";
import type { CreateTenantDraftInput } from "./tenantsService";

const FORM: OnboardingSubmission = {
  companyName: "Harmony Estates Ltd", rcNumber: "", companyAddress: "", statesOfOperation: ["Lagos", "Ogun"], estimatedEstateCount: "2",
  contactName: "Kemi Ade", contactRole: "", contactEmail: "kemi@harmony.ng", contactPhone: "+234 803 000 1111",
  preferredContactMethod: "whatsapp", preferredContactTime: "", message: "",
};

const TENANT_INPUT = (workEmail: string): CreateTenantDraftInput => ({
  identity: { registeredName: "Harmony Estates Ltd", rcNumber: "RC555", companyType: "Limited Liability (Ltd)", dateOfIncorporation: "2020-01-01",
    registeredAddress: { street: "1 A St", city: "Ikeja", state: "Lagos" }, operatingAddress: { street: "1 A St", city: "Ikeja", state: "Lagos" }, statesOfOperation: ["Lagos"] },
  primaryContact: { fullName: "Kemi Ade", roleTitle: "MD", workEmail, phone: "+2348030001111", govIdType: "NIN", govIdNumber: "12345678901" },
  presence: { companyEmail: "info@harmony.ng", companyPhone: "+2348030001111", socials: {} },
  plan: "starter",
} as unknown as CreateTenantDraftInput);

describe("the public form (mock)", () => {
  it("checks the required fields before sending", async () => {
    await expect(submitOnboardingRequest({ ...FORM, companyName: " " })).rejects.toMatchObject({ field: "companyName" });
    await expect(submitOnboardingRequest({ ...FORM, contactPhone: "call me" })).rejects.toMatchObject({ field: "contactPhone" });
    await expect(submitOnboardingRequest({ ...FORM, preferredContactMethod: "" })).rejects.toMatchObject({ field: "preferredContactMethod" });
    await expect(submitOnboardingRequest({ ...FORM, estimatedEstateCount: "a few" })).rejects.toMatchObject({ field: "estimatedEstateCount" });
  });

  it("answers the same whether or not a request is already open — and stores only one", async () => {
    const first = await submitOnboardingRequest(FORM);
    const repeat = await submitOnboardingRequest({ ...FORM, companyName: "Someone else" });
    expect(repeat).toBe(first);
    const open = (await fetchOnboardingRequests("new")).items.filter((r) => r.contactEmail === FORM.contactEmail);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ companyName: "Harmony Estates Ltd", rcNumber: null, estimatedEstateCount: 2, statesOfOperation: ["Lagos", "Ogun"] });
  });
});

describe("needs attention (mock)", () => {
  it("flags a request still new after 2 working days, longest waiting first", async () => {
    const late = await fetchOnboardingRequests(null, {}, true);
    expect(late.items.map((r) => r.id)).toContain("onb-3");
    expect(late.items.every((r) => r.status === "new" && r.needsAttention && r.attentionReason === "no_contact_yet")).toBe(true);
    // Contacted requests never need attention for this reason.
    expect((await fetchOnboardingRequest("onb-1")).needsAttention).toBe(false);
  });
});

describe("reaching the company", () => {
  it("opens WhatsApp, email, a call and a calendar invite, already filled in", () => {
    expect(internationalDigits("0805 444 3322")).toBe("2348054443322");
    expect(internationalDigits("+234 (803) 123-4567")).toBe("2348031234567");
    const links = contactLinks({ companyName: "Sunrise Land", contactName: "Tayo Akande", contactEmail: "tayo@sunrise.ng", contactPhone: "0805 444 3322" },
      { requestUrl: "http://localhost:8443/admin/onboarding-requests/onb-3" });
    expect(links.whatsapp).toMatch(/^https:\/\/wa\.me\/2348054443322\?text=Hello%20Tayo/);
    expect(links.phone).toBe("tel:+2348054443322");
    expect(links.email).toMatch(/^mailto:tayo@sunrise\.ng\?subject=/);
    const meeting = new URL(links.meeting);
    expect(meeting.searchParams.get("add")).toBe("tayo@sunrise.ng");
    expect(meeting.searchParams.get("details")).toContain("/admin/onboarding-requests/onb-3");
  });
});

describe("the queue (mock)", () => {
  it("contacted is repeatable while open; declined is final", async () => {
    await markContacted("onb-1", "Called again.", "admin@landvault.com");
    expect((await fetchOnboardingRequest("onb-1")).contactNote).toBe("Called again.");
    await expect(declineRequest("onb-1", " ", "admin@landvault.com")).rejects.toMatchObject({ field: "reason" });
    expect((await declineRequest("onb-1", "Not a land developer.", "admin@landvault.com")).status).toBe("declined");
    await expect(markContacted("onb-1", "", "admin@landvault.com")).rejects.toMatchObject({ code: "ONBOARDING_REQUEST_CLOSED" });
    expect((await fetchOnboardingRequests("declined")).items.map((r) => r.id)).toContain("onb-1");
  });

  it("converting creates the tenant and closes the request; a refused creation leaves it open", async () => {
    await expect(convertRequest("onb-2", TENANT_INPUT("emeka.okonkwo@gmail.com"), "admin@landvault.com"))
      .rejects.toMatchObject({ code: "EMAIL_ALREADY_REGISTERED", field: "workEmail" });
    expect((await fetchOnboardingRequest("onb-2")).status).toBe("new");

    const converted = await convertRequest("onb-2", TENANT_INPUT("bola.work@greenfieldhomes.ng"), "admin@landvault.com");
    expect(converted).toMatchObject({ status: "converted" });
    expect(converted.organizationId).toBeTruthy();
  });

  it("prefills the wizard with only what the form asked", () => {
    const p = wizardPrefill({ companyName: "Greenfield Homes Ltd", rcNumber: null, companyAddress: "14 Aminu Kano Crescent", statesOfOperation: ["Federal Capital Territory (Abuja)", "Atlantis"],
      contactName: "Bola  Ade Adeyemi", contactRole: null, contactEmail: "b@g.ng", contactPhone: "+234 809" } as OnboardingRequest);
    expect(p).toMatchObject({ registeredName: "Greenfield Homes Ltd", rcNumber: "", registeredAddressStreet: "14 Aminu Kano Crescent",
      statesOfOperation: ["Federal Capital Territory (Abuja)"], firstName: "Bola", lastName: "Ade Adeyemi", roleTitle: "" });
  });
});

// Real mode, against a stubbed fetch. Shapes from OnboardingRequestController,
// AdminOnboardingRequestController and TenancyExceptionHandler (backend fbea703).
describe("real mode", () => {
  type Call = { url: string; method: string; body: unknown };
  let calls: Call[] = [];

  async function live(routes: Record<string, { status: number; body?: unknown }>) {
    calls = [];
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    vi.stubGlobal("localStorage", { getItem: () => "token", setItem: () => {}, removeItem: () => {} });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = url.replace("http://api.test", "");
      const method = (init.method ?? "GET").toUpperCase();
      calls.push({ url: path, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const hit = routes[`${method} ${path}`];
      if (!hit) return new Response(JSON.stringify({ code: "NOT_FOUND" }), { status: 404 });
      return new Response(hit.body === undefined ? null : JSON.stringify(hit.body), { status: hit.status });
    }));
    vi.resetModules();
    return import("./onboardingRequestsService");
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends only what was filled in, and shows the backend's thank-you", async () => {
    const svc = await live({ "POST /api/onboarding-requests": { status: 202, body: { message: "Thank you. We have received your request and our team will be in touch." } } });
    expect(await svc.submitOnboardingRequest(FORM)).toMatch(/^Thank you/);
    expect(calls[0].body).toEqual({
      companyName: "Harmony Estates Ltd", statesOfOperation: ["Lagos", "Ogun"], estimatedEstateCount: 2, contactName: "Kemi Ade",
      contactEmail: "kemi@harmony.ng", contactPhone: "+234 803 000 1111", preferredContactMethod: "whatsapp",
    });
  });

  it("says a rate limit plainly, and puts an unknown state under the states field", async () => {
    const limited = await live({ "POST /api/onboarding-requests": { status: 429, body: { code: "RATE_LIMITED", message: "Too many requests" } } });
    await expect(limited.submitOnboardingRequest(FORM)).rejects.toMatchObject({ code: "RATE_LIMITED", message: expect.stringMatching(/try again later/) });

    const badState = await live({ "POST /api/onboarding-requests": { status: 400, body: { fieldErrors: { statesOfOperation: "'Atlantis' isn't a Nigerian state." } } } });
    await expect(badState.submitOnboardingRequest(FORM)).rejects.toMatchObject({ field: "statesOfOperation", message: "'Atlantis' isn't a Nigerian state." });
  });

  it("filters and pages the queue; contacted sends no body without a note; decline sends the reason", async () => {
    const page = { items: [], total: 0, cursor: null, hasMore: false };
    const svc = await live({
      "GET /api/admin/onboarding-requests?status=contacted&cursor=abc": { status: 200, body: page },
      "POST /api/admin/onboarding-requests/r1/contacted": { status: 200, body: { id: "r1", status: "contacted" } },
      "POST /api/admin/onboarding-requests/r1/decline": { status: 409, body: { code: "ONBOARDING_REQUEST_CLOSED", message: "closed" } },
    });
    expect(await svc.fetchOnboardingRequests("contacted", { cursor: "abc" })).toEqual(page);
    await svc.fetchOnboardingRequests(null, {}, true).catch(() => undefined);
    expect(calls.at(-1)?.url).toBe("/api/admin/onboarding-requests?attention=true");
    calls.pop();
    await svc.markContacted("r1", "  ", "a");
    expect(calls[1].body).toEqual({});
    await expect(svc.declineRequest("r1", " Not a developer ", "a")).rejects.toMatchObject({ code: "ONBOARDING_REQUEST_CLOSED" });
    expect(calls[2].body).toEqual({ reason: "Not a developer" });
  });

  it("converts with exactly the tenant-create body, and names a taken RC number's field", async () => {
    const svc = await live({ "POST /api/admin/onboarding-requests/r1/convert": { status: 409, body: { code: "RC_NUMBER_ALREADY_REGISTERED", message: "taken" } } });
    await expect(svc.convertRequest("r1", TENANT_INPUT("k@h.ng"), "a")).rejects.toMatchObject({ field: "rcNumber", code: "RC_NUMBER_ALREADY_REGISTERED" });
    expect(calls[0].body).toEqual(JSON.parse(JSON.stringify(TENANT_INPUT("k@h.ng"))));
  });
});
