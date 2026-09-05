// Backend integration seam for auth. See INTEGRATION.md.
//
// Single login point for the whole app: one form, one login() call. Mock mode
// decides which account to return by matching the email entered — this is
// standing in for the real backend returning a user with their actual role
// and permission set. Menus render off `permissions`, not a hardcoded role
// switch, so plugging in real per-user RBAC later (see the Developer Portal's
// DP-1.4 / Super Admin's SA-2.1 stories) is additive, not a rewrite.

import type { Currency, KYCStatus } from "../data/mockData";
import { apiClient, setAuthToken } from "../lib/apiClient";

export type UserRole = "client" | "super_admin";

export interface AuthUser {
  name: string;
  email: string;
  phone: string;
  country: string;
  currency: Currency;
  kycStatus: KYCStatus;
  kycType: "local" | "diaspora";
  twoFAEnabled: boolean;
  role: UserRole;
  permissions: string[];
}

const CLIENT_PERMISSIONS = [
  "client.dashboard.view",
  "client.marketplace.view",
  "client.estates.view",
  "client.resale.view",
  "client.portfolio.view",
  "client.documents.view",
  "client.inspections.view",
  "client.enquiries.view",
  "client.syndicates.view",
  "client.support.view",
  "client.settings.view",
];

// Only what's actually built so far (tenant lifecycle + a platform dashboard).
// The rest of the Super Admin backlog (marketplace governance, seller
// verification, reputation/disputes, integrations, billing, compliance,
// support ops) adds its own permission slugs here as those screens land.
const SUPER_ADMIN_PERMISSIONS = [
  "admin.dashboard.view",
  "admin.tenants.view",
  "admin.tenants.manage",
];

export const MOCK_CLIENT_USER: AuthUser = {
  name: "Emeka Okonkwo",
  email: "emeka.okonkwo@gmail.com",
  phone: "+44 7700 900123",
  country: "GB",
  currency: "GBP",
  kycStatus: "approved",
  kycType: "diaspora",
  twoFAEnabled: true,
  role: "client",
  permissions: CLIENT_PERMISSIONS,
};

// Demo super admin account — sign in with this email in mock mode to preview
// the platform console. Stands in for a seeded Super Admin account once the
// backend exists (see the repo-wide note: seeding the first Super Admin is a
// deliberate step, not something a tenant or client can self-register into).
const MOCK_SUPER_ADMIN_USER: AuthUser = {
  name: "Ada Nwosu",
  email: "admin@landvault.com",
  phone: "+234 802 000 0000",
  country: "NG",
  currency: "NGN",
  kycStatus: "approved",
  kycType: "local",
  twoFAEnabled: true,
  role: "super_admin",
  permissions: SUPER_ADMIN_PERMISSIONS,
};

export async function login(email: string, password?: string): Promise<AuthUser> {
  if (apiClient.isMockMode) {
    return email.trim().toLowerCase() === MOCK_SUPER_ADMIN_USER.email
      ? MOCK_SUPER_ADMIN_USER
      : MOCK_CLIENT_USER;
  }
  const { user, token } = await apiClient.post<{ user: AuthUser; token: string }>("/api/auth/login", { email, password });
  setAuthToken(token);
  return user;
}

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  country: string;
  currency: Currency;
}

// Deliberately distinct from login() above. A returning user signing back in
// gets the pre-seeded, already-verified MOCK_CLIENT_USER — but a genuinely
// new signup has never been through KYC. This is what makes the purchase-time
// KYC gate (kycService.ts) actually reachable: sign IN with an existing
// account and you're pre-verified; REGISTER fresh and you're not, and the
// buyer type (kycService's local/diaspora split) is driven by the country
// entered here, not chosen again later.
export async function register(input: RegisterInput): Promise<AuthUser> {
  if (apiClient.isMockMode) {
    return {
      name: input.name || "New Buyer",
      email: input.email,
      phone: input.phone,
      country: input.country,
      currency: input.currency,
      kycStatus: "unsubmitted",
      kycType: input.country === "NG" ? "local" : "diaspora",
      twoFAEnabled: false,
      role: "client",
      permissions: CLIENT_PERMISSIONS,
    };
  }
  const { user, token } = await apiClient.post<{ user: AuthUser; token: string }>("/api/auth/register", input);
  setAuthToken(token);
  return user;
}

export function logout(): void {
  setAuthToken(null);
}
