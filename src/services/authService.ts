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

// Three audiences, three surfaces: buyers (/dashboard, /marketplace,
// /portfolio), a company's own staff (/portal/*), and the platform operator
// (/admin/*). The portal is neither of the other two and is never folded into
// them.
export type UserRole = "client" | "developer" | "super_admin";

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
  // Which company this user acts for, and — for branch-scoped staff — which
  // branch. The backend's JWT already carries both, so these close a contract
  // gap rather than inventing mock-only fields.
  //
  // A null/absent branchId means NOT branch-scoped: an Executive Director
  // sees across their company's branches. Buyers and platform staff have
  // neither field.
  //
  // Scoping itself is enforced server-side by RLS. These are here so the
  // mock layer can stand in for that, and so the UI can say whose estates it
  // is showing — never so the frontend can re-filter or widen a scope.
  tenantId?: string;
  branchId?: string | null;
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

// Only what's actually built so far (tenant lifecycle, a platform dashboard,
// and SA-3.4's listing-conflict detection). The rest of the Super Admin
// backlog (the rest of marketplace governance, seller verification,
// reputation/disputes, integrations, billing, compliance, support ops) adds
// its own permission slugs here as those screens land.
const SUPER_ADMIN_PERMISSIONS = [
  "admin.dashboard.view",
  "admin.tenants.view",
  "admin.tenants.manage",
  "admin.marketplace.conflicts",
];

// Only what this slice actually builds (DP-1 to DP-6: reach the portal, list
// estates, create one, see its boundary). Inventory, disclosure and
// publication add their own slugs here as those screens land.
const PORTAL_PERMISSIONS = [
  "portal.estates.view",
  "portal.estates.manage",
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

// Demo developer-portal accounts, both staff of the seeded Estintin Group
// tenant. Two of them on purpose: branch scoping is invisible with only one
// account, because a wrongly-scoped list just looks shorter than expected.
//
// Chidi is an Executive Director (no branch — sees all of Estintin's
// estates); Tunde manages the Heritage branch and is the same person named as
// Heritage's manager in tenantsService.ts's seed data.
const MOCK_PORTAL_DIRECTOR: AuthUser = {
  name: "Chidi Okeke",
  email: "director@estintin.com",
  phone: "+234 803 111 2222",
  country: "NG",
  currency: "NGN",
  kycStatus: "approved",
  kycType: "local",
  twoFAEnabled: true,
  role: "developer",
  permissions: PORTAL_PERMISSIONS,
  tenantId: "estintin-group",
  branchId: null,
};

const MOCK_PORTAL_BRANCH_MANAGER: AuthUser = {
  name: "Tunde Bakare",
  email: "heritage@estintin.com",
  phone: "+234 803 333 4444",
  country: "NG",
  currency: "NGN",
  kycStatus: "approved",
  kycType: "local",
  twoFAEnabled: true,
  role: "developer",
  permissions: PORTAL_PERMISSIONS,
  tenantId: "estintin-group",
  branchId: "heritage",
};

// Still one login form for every account type — this table stands in for the
// real backend returning whichever user the credentials belong to, with their
// actual role, permissions and tenant/branch claims.
const MOCK_ACCOUNTS_BY_EMAIL: Record<string, AuthUser> = {
  [MOCK_SUPER_ADMIN_USER.email]: MOCK_SUPER_ADMIN_USER,
  [MOCK_PORTAL_DIRECTOR.email]: MOCK_PORTAL_DIRECTOR,
  [MOCK_PORTAL_BRANCH_MANAGER.email]: MOCK_PORTAL_BRANCH_MANAGER,
};

export async function login(email: string, password?: string): Promise<AuthUser> {
  if (apiClient.isMockMode) {
    return MOCK_ACCOUNTS_BY_EMAIL[email.trim().toLowerCase()] ?? MOCK_CLIENT_USER;
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
