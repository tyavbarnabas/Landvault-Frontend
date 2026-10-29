// The buyer's postal address, kept on the account (backend changeset 097):
// asked for the first time they buy, editable in Settings, and copied onto
// each purchase when it is opened — that copy is what the allocation letter
// prints, so changing the address later never changes a purchase or letter.
// Personal data like the phone number: shown to the buyer only, and sent
// nowhere but PUT /api/me/address.
//
//   GET /api/me/address   200 Address, or 204 when there is none yet
//   PUT /api/me/address   replaces the whole address

import { apiClient, ApiError } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { dialCountry } from "../data/dialCodes";
import { NIGERIAN_STATES, STATE_ISO_CODES } from "../data/nigerianStates";

export interface Address {
  line1: string;
  line2: string | null;
  city: string;
  // For Nigeria, one of the 36 states or the FCT, by its canonical name.
  state: string;
  postalCode: string | null;
  // ISO two-letter code; may differ from the account's country.
  country: string;
  countryName: string;
  updatedAt: string;
}

// The copy a purchase keeps (Transaction.buyerAddress).
export type PurchaseAddress = Pick<Address, "line1" | "line2" | "city" | "state" | "postalCode" | "country">;

export interface AddressInput {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode?: string;
  country: string;
}

export const ADDRESS_LIMITS = { line1: 200, line2: 200, city: 100, state: 100, postalCode: 20 } as const;

interface AccountRef { email: string; address?: Address | null }

export async function fetchAddress(user: AccountRef): Promise<Address | null> {
  if (!isMock("address")) return (await apiClient.get<Address | undefined>("/api/me/address")) ?? null;
  return mockAddressFor(user.email) ?? user.address ?? null;
}

export async function saveAddress(user: AccountRef, input: AddressInput): Promise<Address> {
  if (!isMock("address")) return apiClient.put<Address>("/api/me/address", trimmed(input));
  const saved = mockValidate(trimmed(input));
  mockStore()[user.email.toLowerCase()] = saved;
  writeMockStore();
  return saved;
}

// The address as lines, the way the allocation letter prints it.
export function addressLines(a: PurchaseAddress & { countryName?: string }): string[] {
  const country = a.countryName ?? dialCountry(a.country)?.name ?? a.country;
  return [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", "), a.postalCode, country].filter((l): l is string => !!l);
}

// The backend's field errors, by field; anything else as one message.
export function addressErrors(err: unknown): { fields: Partial<Record<keyof AddressInput, string>>; message: string } {
  if (!(err instanceof ApiError)) return { fields: {}, message: "Your address couldn't be saved. Check your connection and try again." };
  const fields = { ...err.body?.fieldErrors } as Partial<Record<keyof AddressInput, string>>;
  if (err.body?.code === "UNKNOWN_STATE") fields.state ??= "Choose a Nigerian state, or the FCT.";
  if (err.body?.code === "UNKNOWN_COUNTRY") fields.country ??= "Choose a country from the list.";
  return { fields, message: Object.keys(fields).length ? "" : err.message || "Your address couldn't be saved. Try again." };
}

function trimmed(input: AddressInput): AddressInput {
  return {
    line1: input.line1.trim(),
    line2: input.line2?.trim() || undefined,
    city: input.city.trim(),
    state: input.state.trim(),
    postalCode: input.postalCode?.trim() || undefined,
    country: input.country.trim().toUpperCase(),
  };
}

// ─── Demo mode ───────────────────────────────────────────────────────────────
//
// The backend's rules, so the form meets the same errors. Kept for the browser
// session, like the demo user it belongs to.

const MOCK_KEY = "hometrue.mock.addresses";
let store: Record<string, Address> | null = null;

function mockStore(): Record<string, Address> {
  if (!store) {
    try { store = JSON.parse(sessionStorage.getItem(MOCK_KEY) ?? "{}"); } catch { store = {}; }
  }
  return store!;
}

function writeMockStore() {
  try { sessionStorage.setItem(MOCK_KEY, JSON.stringify(mockStore())); } catch { /* memory only */ }
}

// What the mock checkout checks before opening a purchase. The demo buyer's
// own address (on MOCK_CLIENT_USER) stands until they save another; a new
// sign-up has none, so checkout meets ADDRESS_REQUIRED.
export function mockAddressFor(email: string): Address | null {
  return mockStore()[email.toLowerCase()] ?? null;
}

// "Lagos State", "lagos", "LA", "NG-LA", "FCT" and "Abuja" all name a state;
// the canonical name comes back.
export function nigerianStateFor(input: string): string | null {
  const key = input.trim().toLowerCase().replace(/\s+state$/, "").replace(/\s+/g, " ");
  if (!key) return null;
  if (["fct", "abuja", "fct abuja", "federal capital territory"].includes(key)) return "Federal Capital Territory (Abuja)";
  return NIGERIAN_STATES.find((s) => s.toLowerCase() === key || STATE_ISO_CODES[s].toLowerCase() === key || STATE_ISO_CODES[s].slice(3).toLowerCase() === key) ?? null;
}

function mockValidate(input: AddressInput): Address {
  const fieldErrors: Record<string, string> = {};
  const need = (field: "line1" | "city" | "state", label: string) => { if (!input[field]) fieldErrors[field] = `${label} is required.`; };
  need("line1", "Address line 1");
  need("city", "City");
  need("state", "State");
  for (const [field, max] of Object.entries(ADDRESS_LIMITS)) {
    const value = input[field as keyof AddressInput];
    if (value && value.length > max) fieldErrors[field] = `Must be ${max} characters or fewer.`;
  }
  if (Object.keys(fieldErrors).length) throw new ApiError(400, "Some fields need attention.", { code: "VALIDATION_ERROR", fieldErrors });

  const country = dialCountry(input.country);
  if (!country) throw new ApiError(400, "Unknown country.", { code: "UNKNOWN_COUNTRY", fieldErrors: { country: "Choose a country from the list." } });
  let state = input.state;
  if (country.iso === "NG") {
    const canonical = nigerianStateFor(input.state);
    if (!canonical) throw new ApiError(400, "Unknown Nigerian state.", { code: "UNKNOWN_STATE", fieldErrors: { state: "Choose a Nigerian state, or the FCT." } });
    state = canonical;
  }
  return {
    line1: input.line1, line2: input.line2 ?? null, city: input.city, state, postalCode: input.postalCode ?? null,
    country: country.iso, countryName: country.name, updatedAt: new Date().toISOString(),
  };
}
