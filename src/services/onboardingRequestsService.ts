// A developer company asking to join HomeTrue (backend commit fbea703). Two
// audiences:
//
//   PUBLIC       POST /api/onboarding-requests — the "list your company" form.
//                Creates nothing: no account, no company. Every accepted
//                submission gets the same 202 and message, including a repeat
//                from an email with a request still open (silently dropped),
//                so the reply never reveals whether HomeTrue knows a company.
//                Rate-limited: 429 RATE_LIMITED past 5 an hour per address.
//
//   SUPER ADMIN  /api/admin/onboarding-requests — the queue (admin.tenants.view
//                to read, admin.tenants.manage to act): contacted, decline,
//                and convert, which takes exactly POST /api/admin/tenants's body
//                and creates the tenant and invites its director, all or
//                nothing.
//
// new → contacted (repeatable) → converted | declined. The last two are final.

import { ApiError, apiClient } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { paginateMock, type Page, type PageParams } from "../lib/pagination";
import { NIGERIAN_STATES, type NigerianState } from "../data/nigerianStates";
import { createTenantDraft, type CreateTenantDraftInput } from "./tenantsService";

export type OnboardingRequestStatus = "new" | "contacted" | "converted" | "declined";
export type ContactMethod = "email" | "phone" | "whatsapp" | "meeting";

export const CONTACT_METHODS: { id: ContactMethod; label: string }[] = [
  { id: "phone", label: "Phone call" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "Email" },
  { id: "meeting", label: "In-person meeting" },
];

export function contactMethodLabel(method: string): string {
  return CONTACT_METHODS.find((m) => m.id === method)?.label ?? method;
}

// OnboardingRequestSubmission.
export interface OnboardingSubmission {
  companyName: string;
  rcNumber: string;
  companyAddress: string;
  statesOfOperation: NigerianState[];
  // Kept as typed; "" means not given.
  estimatedEstateCount: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  contactPhone: string;
  preferredContactMethod: ContactMethod | "";
  preferredContactTime: string;
  message: string;
}

// OnboardingRequestDto.
export interface OnboardingRequest {
  id: string;
  status: OnboardingRequestStatus;
  companyName: string;
  rcNumber: string | null;
  companyAddress: string | null;
  statesOfOperation: string[];
  estimatedEstateCount: number | null;
  contactName: string;
  contactRole: string | null;
  contactEmail: string;
  contactPhone: string;
  preferredContactMethod: ContactMethod;
  preferredContactTime: string | null;
  message: string | null;
  createdAt: string;
  contactedAt: string | null;
  contactedBy: string | null;
  contactNote: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  declineReason: string | null;
  // The tenant it became, once converted.
  organizationId: string | null;
  // Computed by the backend when read: "no_contact_yet" = still new after 2
  // working days (Mon–Fri, Lagos time; landvault.onboarding.attention-after-working-days).
  needsAttention: boolean;
  attentionReason: "no_contact_yet" | null;
}

export const isOpenRequest = (r: Pick<OnboardingRequest, "status">) => r.status === "new" || r.status === "contacted";

// ─── Errors ──────────────────────────────────────────────────────────────────

export class OnboardingError extends Error {
  field: string;
  code: string;
  constructor(field: string, code: string, message: string) {
    super(message);
    this.name = "OnboardingError";
    this.field = field;
    this.code = code;
  }
}

// The backend's own field messages are terse ("must not be blank"); these
// say it the way a company filling the form needs to hear it.
const FIELD_MESSAGES: Record<string, string> = {
  companyName: "Enter your company's name.",
  contactName: "Enter your name.",
  contactEmail: "Enter a valid email address.",
  contactPhone: "Enter a phone number, e.g. +234 803 123 4567.",
  preferredContactMethod: "Choose how you'd like us to contact you.",
  estimatedEstateCount: "Enter a whole number, or leave it empty.",
};

const ADMIN_MESSAGES: Record<string, { field: string; message: string }> = {
  ONBOARDING_REQUEST_NOT_FOUND: { field: "form", message: "That request no longer exists." },
  ONBOARDING_REQUEST_CLOSED: { field: "form", message: "This request has already been converted or declined. Refresh to see it." },
  RC_NUMBER_ALREADY_REGISTERED: { field: "rcNumber", message: "A company with this RC number is already registered on HomeTrue." },
  EMAIL_ALREADY_REGISTERED: { field: "workEmail", message: "This email already has a HomeTrue account. Use the contact's work email — the first Executive Director is invited, and needs an address with no account yet." },
};

function onboardingError(err: unknown): Error {
  if (!(err instanceof ApiError)) return err instanceof Error ? err : new Error("That didn't go through.");
  const body = err.body;
  if (body?.fieldErrors) {
    const [field, message] = Object.entries(body.fieldErrors)[0] ?? [];
    // An unknown state comes back with the backend's own wording, naming it.
    if (field) return new OnboardingError(field, "VALIDATION", field === "statesOfOperation" ? message : FIELD_MESSAGES[field] ?? message);
  }
  const code = body?.code ?? `HTTP_${err.status}`;
  if (code === "RATE_LIMITED") return new OnboardingError("form", code, "We've had several requests from this connection in the last hour. Please try again later.");
  const known = ADMIN_MESSAGES[code];
  return new OnboardingError(known?.field ?? "form", code, known?.message ?? body?.message ?? "That didn't go through. Please try again.");
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (err) {
    throw onboardingError(err);
  }
}

// ─── Public: the form ────────────────────────────────────────────────────────

function validateSubmission(s: OnboardingSubmission): void {
  if (!s.companyName.trim()) throw new OnboardingError("companyName", "VALIDATION", FIELD_MESSAGES.companyName);
  if (!s.contactName.trim()) throw new OnboardingError("contactName", "VALIDATION", FIELD_MESSAGES.contactName);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.contactEmail.trim())) throw new OnboardingError("contactEmail", "VALIDATION", FIELD_MESSAGES.contactEmail);
  // The backend's own rule: ^\+?[0-9 ()-]{7,30}$.
  if (!/^\+?[0-9 ()-]{7,30}$/.test(s.contactPhone.trim())) throw new OnboardingError("contactPhone", "VALIDATION", FIELD_MESSAGES.contactPhone);
  if (!s.preferredContactMethod) throw new OnboardingError("preferredContactMethod", "VALIDATION", FIELD_MESSAGES.preferredContactMethod);
  if (s.estimatedEstateCount.trim() && !/^\d{1,5}$/.test(s.estimatedEstateCount.trim())) throw new OnboardingError("estimatedEstateCount", "VALIDATION", FIELD_MESSAGES.estimatedEstateCount);
}

// Optional fields left empty are left out, not sent as "".
function submissionBody(s: OnboardingSubmission): Record<string, unknown> {
  const optional = (value: string) => (value.trim() ? value.trim() : undefined);
  return {
    companyName: s.companyName.trim(),
    rcNumber: optional(s.rcNumber),
    companyAddress: optional(s.companyAddress),
    statesOfOperation: s.statesOfOperation.length ? s.statesOfOperation : undefined,
    estimatedEstateCount: s.estimatedEstateCount.trim() ? Number(s.estimatedEstateCount.trim()) : undefined,
    contactName: s.contactName.trim(),
    contactRole: optional(s.contactRole),
    contactEmail: s.contactEmail.trim(),
    contactPhone: s.contactPhone.trim(),
    preferredContactMethod: s.preferredContactMethod,
    preferredContactTime: optional(s.preferredContactTime),
    message: optional(s.message),
  };
}

const RECEIVED_MESSAGE = "Thank you. We have received your request and our team will be in touch.";

// Resolves with the backend's thank-you message — the same whatever happened
// to the request behind it.
export async function submitOnboardingRequest(s: OnboardingSubmission): Promise<string> {
  validateSubmission(s);
  const body = submissionBody(s);
  if (!isMock("onboardingRequests")) {
    // Public: no session to renew if something answers 401.
    const res = await call(() => apiClient.post<{ message: string }>("/api/onboarding-requests", body, { skipAuthRefresh: true }));
    return res.message;
  }
  const email = String(body.contactEmail).toLowerCase();
  // A repeat while one is open: same answer, nothing stored.
  if (!mockRequests.some((r) => isOpenRequest(r) && r.contactEmail.toLowerCase() === email)) {
    mockRequests.unshift({
      id: `onb-${++mockSeq}`, status: "new", companyName: String(body.companyName), rcNumber: (body.rcNumber as string) ?? null,
      companyAddress: (body.companyAddress as string) ?? null, statesOfOperation: [...s.statesOfOperation],
      estimatedEstateCount: (body.estimatedEstateCount as number) ?? null, contactName: String(body.contactName),
      contactRole: (body.contactRole as string) ?? null, contactEmail: String(body.contactEmail), contactPhone: String(body.contactPhone),
      preferredContactMethod: s.preferredContactMethod as ContactMethod, preferredContactTime: (body.preferredContactTime as string) ?? null,
      message: (body.message as string) ?? null, createdAt: new Date().toISOString(), contactedAt: null, contactedBy: null, contactNote: null,
      decidedAt: null, decidedBy: null, declineReason: null, organizationId: null, needsAttention: false, attentionReason: null,
    });
  }
  return RECEIVED_MESSAGE;
}

// ─── Super Admin: the queue ──────────────────────────────────────────────────

// Newest first — or, with `attention`, only those waiting too long, longest
// waiting first.
export async function fetchOnboardingRequests(status: OnboardingRequestStatus | null, params: PageParams = {}, attention = false): Promise<Page<OnboardingRequest>> {
  if (!isMock("onboardingRequests")) {
    const qp = new URLSearchParams();
    if (status) qp.set("status", status);
    if (attention) qp.set("attention", "true");
    if (params.limit) qp.set("limit", String(params.limit));
    if (params.cursor) qp.set("cursor", params.cursor);
    return apiClient.get<Page<OnboardingRequest>>(`/api/admin/onboarding-requests?${qp}`);
  }
  const all = mockRequests.map(withMockAttention).filter((r) => (!status || r.status === status) && (!attention || r.needsAttention));
  if (attention) all.reverse();
  return paginateMock(all, params);
}

export async function fetchOnboardingRequest(id: string): Promise<OnboardingRequest> {
  if (!isMock("onboardingRequests")) return call(() => apiClient.get<OnboardingRequest>(`/api/admin/onboarding-requests/${id}`));
  return withMockAttention(mockFind(id));
}

// Repeatable while open: the latest contact and note are kept (every one is
// in the backend's audit log).
export async function markContacted(id: string, note: string, actor: string): Promise<OnboardingRequest> {
  if (note.length > 2000) throw new OnboardingError("note", "VALIDATION", "Keep the note to 2,000 characters.");
  if (!isMock("onboardingRequests")) {
    return call(() => apiClient.post<OnboardingRequest>(`/api/admin/onboarding-requests/${id}/contacted`, note.trim() ? { note: note.trim() } : {}));
  }
  const r = mockOpen(id);
  Object.assign(r, { status: "contacted", contactedAt: new Date().toISOString(), contactedBy: actor, contactNote: note.trim() || null });
  return withMockAttention(r);
}

// Final. The reason stays with HomeTrue — it is NOT emailed to the company.
export async function declineRequest(id: string, reason: string, actor: string): Promise<OnboardingRequest> {
  if (!reason.trim()) throw new OnboardingError("reason", "VALIDATION", "Give a reason. It's kept for HomeTrue and not sent to the company.");
  if (reason.trim().length > 1000) throw new OnboardingError("reason", "VALIDATION", "Keep the reason to 1,000 characters.");
  if (!isMock("onboardingRequests")) {
    return call(() => apiClient.post<OnboardingRequest>(`/api/admin/onboarding-requests/${id}/decline`, { reason: reason.trim() }));
  }
  const r = mockOpen(id);
  Object.assign(r, { status: "declined", decidedAt: new Date().toISOString(), decidedBy: actor, declineReason: reason.trim() });
  return withMockAttention(r);
}

// Creates the tenant and invites its first Executive Director exactly as
// POST /api/admin/tenants does, and marks the request converted — all or
// nothing: if creation is refused (RC number or email already registered),
// the request stays open.
export async function convertRequest(id: string, input: CreateTenantDraftInput, actor: string): Promise<OnboardingRequest> {
  if (!isMock("onboardingRequests")) return call(() => apiClient.post<OnboardingRequest>(`/api/admin/onboarding-requests/${id}/convert`, input));
  const r = mockOpen(id);
  const tenant = await call(() => createTenantDraft(input));
  Object.assign(r, { status: "converted", decidedAt: new Date().toISOString(), decidedBy: actor, organizationId: tenant.id });
  return withMockAttention(r);
}

// What the tenant wizard can take from a request. Only what a first-contact
// form asks; the rest (company type, incorporation date, the director's ID,
// documents…) is filled in by the Super Admin.
export function wizardPrefill(r: OnboardingRequest) {
  const [firstName, ...rest] = r.contactName.trim().split(/\s+/);
  const states = r.statesOfOperation.filter((s): s is NigerianState => (NIGERIAN_STATES as readonly string[]).includes(s));
  return {
    registeredName: r.companyName,
    rcNumber: r.rcNumber ?? "",
    // Free text on the form; the wizard wants street/city/state, so it lands
    // in the street line for the admin to split.
    registeredAddressStreet: r.companyAddress ?? "",
    statesOfOperation: states,
    firstName: firstName ?? "",
    lastName: rest.join(" "),
    roleTitle: r.contactRole ?? "",
    workEmail: r.contactEmail,
    phone: r.contactPhone,
  };
}

// ─── Reaching the company ────────────────────────────────────────────────────
//
// Buttons that open the right app, already filled in. The conversation itself
// happens outside HomeTrue; recording it is still "Mark as contacted".

// wa.me wants the number in international form, digits only. A Nigerian
// number written locally (0803…) becomes 234803….
export function internationalDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
}

export function contactLinks(r: Pick<OnboardingRequest, "companyName" | "contactName" | "contactEmail" | "contactPhone">, from: { requestUrl: string }) {
  const firstName = r.contactName.trim().split(/\s+/)[0] ?? "";
  const greeting = `Hello ${firstName}, this is HomeTrue, following up on your request to list ${r.companyName}.`;
  const title = `HomeTrue × ${r.companyName}: onboarding call`;
  const calendar = new URLSearchParams({
    action: "TEMPLATE", text: title, add: r.contactEmail,
    details: `Introductory call about listing ${r.companyName} on HomeTrue.\n\nRequest: ${from.requestUrl}`,
  });
  return {
    whatsapp: `https://wa.me/${internationalDigits(r.contactPhone)}?text=${encodeURIComponent(greeting)}`,
    email: `mailto:${r.contactEmail}?subject=${encodeURIComponent(`Your request to list ${r.companyName} on HomeTrue`)}&body=${encodeURIComponent(`${greeting}\n\n`)}`,
    phone: `tel:+${internationalDigits(r.contactPhone)}`,
    // A new Google Calendar event with them as guest; Google adds the Meet link.
    meeting: `https://calendar.google.com/calendar/render?${calendar}`,
  };
}

// ─── Mock store ──────────────────────────────────────────────────────────────

// The backend's rule, for mock mode: still new after 2 working days (Mon–Fri).
// Lagos time and the configurable threshold are the backend's concern.
function workingDaysSince(iso: string, now = new Date()): number {
  let days = 0;
  const day = new Date(iso);
  day.setUTCHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  while (day < today) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) days++;
  }
  return days;
}

function withMockAttention(r: OnboardingRequest): OnboardingRequest {
  const late = r.status === "new" && workingDaysSince(r.createdAt) >= 2;
  return { ...r, needsAttention: late, attentionReason: late ? "no_contact_yet" : null };
}

let mockSeq = 3;
const mockRequests: OnboardingRequest[] = [
  {
    id: "onb-3", status: "new", companyName: "Sunrise Land Ltd", rcNumber: null, companyAddress: "Ring Road, Ibadan", statesOfOperation: ["Oyo", "Ogun"],
    estimatedEstateCount: 2, contactName: "Tayo Akande", contactRole: "Director", contactEmail: "tayo@sunriseland.ng", contactPhone: "0805 444 3322",
    preferredContactMethod: "email", preferredContactTime: null, message: null, createdAt: "2026-10-06T08:30:00Z",
    contactedAt: null, contactedBy: null, contactNote: null, decidedAt: null, decidedBy: null, declineReason: null, organizationId: null, needsAttention: false, attentionReason: null,
  },
  {
    id: "onb-2", status: "new", companyName: "Greenfield Homes Ltd", rcNumber: "RC1987654", companyAddress: "14 Aminu Kano Crescent, Wuse 2, Abuja",
    statesOfOperation: ["Federal Capital Territory (Abuja)", "Nasarawa"], estimatedEstateCount: 3, contactName: "Bola Adeyemi",
    contactRole: "Managing Director", contactEmail: "bola@greenfieldhomes.ng", contactPhone: "+234 809 555 0101", preferredContactMethod: "phone",
    preferredContactTime: "Weekdays after 2pm", message: "We have three estates in Abuja and want to sell to the diaspora.",
    createdAt: "2026-10-14T09:12:00Z", contactedAt: null, contactedBy: null, contactNote: null, decidedAt: null, decidedBy: null, declineReason: null, organizationId: null, needsAttention: false, attentionReason: null,
  },
  {
    id: "onb-1", status: "contacted", companyName: "Lekki Coastal Estates", rcNumber: null, companyAddress: null, statesOfOperation: ["Lagos"],
    estimatedEstateCount: 1, contactName: "Ifeoma Nwosu", contactRole: null, contactEmail: "ifeoma@lekkicoastal.com", contactPhone: "+234 803 222 7788",
    preferredContactMethod: "whatsapp", preferredContactTime: null, message: null, createdAt: "2026-10-10T15:40:00Z",
    contactedAt: "2026-10-11T10:00:00Z", contactedBy: "admin@landvault.com", contactNote: "Called; sending CAC documents next week.",
    decidedAt: null, decidedBy: null, declineReason: null, organizationId: null, needsAttention: false, attentionReason: null,
  },
];

function mockFind(id: string): OnboardingRequest {
  const r = mockRequests.find((x) => x.id === id);
  if (!r) throw new OnboardingError("form", "ONBOARDING_REQUEST_NOT_FOUND", ADMIN_MESSAGES.ONBOARDING_REQUEST_NOT_FOUND.message);
  return r;
}

function mockOpen(id: string): OnboardingRequest {
  const r = mockFind(id);
  if (!isOpenRequest(r)) throw new OnboardingError("form", "ONBOARDING_REQUEST_CLOSED", ADMIN_MESSAGES.ONBOARDING_REQUEST_CLOSED.message);
  return r;
}
