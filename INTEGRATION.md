# Backend integration

This app runs against **mock data by default** (`src/data/mockData.ts`) so it works standalone with no backend. It's built so switching a domain over to the real API is a contained change — not a rewrite — once the backend exists.

## How the seam works

```
Component  →  service (src/services/*.ts)  →  apiClient (src/lib/apiClient.ts)  →  real API
                     ↑ branches on IS_MOCK_MODE
                     ↓
              bundled mock data (src/data/mockData.ts)
```

- **`src/lib/apiClient.ts`** — a thin `fetch` wrapper. Reads `VITE_API_BASE_URL` from the environment (see `.env.example`). If it's unset, `apiClient.isMockMode` is `true`.
- **`src/services/*.ts`** — one file per domain (`estatesService.ts`, `reviewsService.ts`, `authService.ts`, …). Every exported function is `async` and starts with an `if (apiClient.isMockMode) { … return mock data … }` branch. Components call **only** these functions — never `data/mockData.ts` directly.
- **Components** already fetch through `useEffect` + loading state, so they don't change at all when a service's mock branch is replaced with a real `apiClient.get(...)` call.

### To connect a real backend

1. Set `VITE_API_BASE_URL` in `.env.local` (copy `.env.example`).
2. In each service file, fill in the real endpoint path in the non-mock branch (the shape is already sketched — see `estatesService.ts` / `reviewsService.ts` for the pattern).
3. Auth: `authService.login()` expects the real endpoint to return `{ user, token }`; the token is stored via `setAuthToken()` and auto-attached as `Authorization: Bearer <token>` on every subsequent `apiClient` call.
4. Nothing else changes — components re-render off the same state they already manage.

## Migrated to the service layer

Every page now fetches through `src/services/*.ts` — none import `mockData.ts` arrays directly any more (only type-only imports and the services themselves touch it). Services in place:

- **`estatesService.ts`** — `Browse.tsx`, `EstateDetail.tsx`, `Resale.tsx`, `Checkout.tsx`, `Upgrade.tsx`, `Syndicate.tsx`
- **`reviewsService.ts`** — `EstateReviews.tsx` (mounted on `EstateDetail.tsx`)
- **`authService.ts`** — `AppContext.tsx`, `Login.tsx`, `Register.tsx`
- **`portfolioService.ts`** (owned plots + payments) — `Dashboard.tsx`, `Portfolio.tsx`, `PlotView.tsx`, `Upgrade.tsx`, `Support.tsx`, `Resale.tsx`
- **`documentsService.ts`** — `Vault.tsx`, `PlotView.tsx`
- **`syndicatesService.ts`** — `Syndicate.tsx` (`SyndicateList`, `CreateSyndicate`, `SyndicateDetail`); creating a syndicate now actually persists it (mock store) and the "Open dashboard" link goes to the real created id, not a hardcoded one
- **`disputesService.ts`** — `Support.tsx`'s disputes tab; the live-chat tab intentionally stays local component state (it's a scripted demo bot, not real backend data — nothing to migrate until a real chat backend exists)
- **`checkoutService.ts`** — `Checkout.tsx`. Models the real shape of a payment flow (reserve → initiate payment → confirm) so a real gateway integration later means filling in three functions, not restructuring the page. **This does not talk to a real payment gateway** — there are no Paystack/Opay credentials or webhook handling here; mock mode simulates the same outcomes the UI always assumed. A successful mock payment now calls `portfolioService.addOwnedPlot()`, so checkout actually produces a real entry in Portfolio/Dashboard/Vault instead of just showing a cosmetic success screen.
- **`portalInventoryService.ts`** — the portal's blocks, price tiers and plots. Two fields the backend deliberately does not accept, and neither does this module: **`nominalSizeSqm`** (a plot's nominal size IS its tier's, copied at creation — accepting one would let a caller contradict the tier the plot is priced by, leaving the invoice and the deed disagreeing about what was sold; the sole exception is `nominalSizeSqmOverride` on a `UNIT_TYPE` tier, which has no size of its own) and **`actualAreaSqm`** (computed from the footprint on write — `ST_Area(footprint::geography)` on a real backend, `polygonAreaSqm` inside the service here; never an input and never derived at the display layer). Nominal and surveyed area are shown as separate columns and are never reconciled. `POST /{id}/plots` caps at 500, so `createPlotBatch` mirrors that cap and `createPlotsInBatches` splits a larger set across requests with progress reporting.
- **`portalEstatesService.ts`** — the developer portal's estate management (`/api/portal/estates`), gated on `portal.estates.view` / `portal.estates.manage`. Reads the **canonical** `mockData.ts` estates rather than a parallel portal fixture set, so the portal and the public marketplace can never disagree about publication state. **Scoping is server-side (RLS)**: the real endpoint derives tenant and branch from the JWT, and the `scope` argument exists only so mock mode can stand in for it — no page re-filters the returned list, and a branch-scoped caller cannot widen its scope. Publication eligibility is returned as **six separate booleans** so a refusal can name the failing condition; `blockingReasonsFor()` is the one place those map to copy. `parseBoundary()` mirrors the backend's GeoJSON validation for fast feedback only — the backend still re-validates and is the authority.
- **Map tiles** — `EstateBoundaryMap` uses Esri World Imagery, which is free and needs no account. **A production tile provider is a separate decision** (imagery licensing, usage limits, an API key) and is the one external dependency in this repo with no `isMockMode` seam behind it.
- **`costDisclosureService.ts`** — cost disclosure (total commitment per tier, the itemised fee schedule, exit costs). **Public endpoints — no token**: these must stay readable before anyone registers, so nothing consuming them may be gated on auth. Mock figures are drawn from real Nigerian offer documents. The binding rule is **display, never recompute**: totals, refund amounts and penalty amounts all arrive computed in naira, and the frontend does no arithmetic on money. Note that `mockData.ts`'s `formatAmount` *converts* from naira into the buyer's display currency, so contractual figures use `formatDeclaredAmount`/`formatCompactDeclared` (`src/lib/formatCurrency.ts`) instead — a fee quoted in USD must not be re-based.
- **`attentionService.ts`** — `Dashboard.tsx`'s attention strip. **Not a straight async swap**: it is a cross-cutting, time-filtered query spanning owned plots, in-flight upgrade requests, newly issued documents and wishlist price moves, and it becomes one endpoint (`GET /api/me/attention?since=&dueWithinDays=`) rather than the four separate fetches mock mode composes it from. The `AttentionItem` shape is documented at the top of that file — writing it down before `sales`/`finance` are built is the point, so those modules aren't designed to answer only "list my plots".
- **`notificationsService.ts`** — `AppContext.tsx` (`notifications`, `markNotificationRead`), consumed by the notification bell in `Layout.tsx`. Marking a notification read is optimistic (updates the UI immediately, then fires the request) — a real backend failure wouldn't currently roll that back, worth adding if this becomes user-visible-critical.

Every migrated page follows the same shape: `useState` + `useEffect` fetch + a loading branch before the main render — see `Browse.tsx` or `PlotView.tsx` as reference examples.

## Still needs real work beyond an async swap

These aren't just "point at a new URL" — they need actual backend-shaped rework:

- **`src/components/PlotCanvas.tsx`** — plot geometry. Currently a `row`/`col` grid grouped into visual "blocks" for the street-map look. The real backend will serve PostGIS-derived polygons; rendering real geometry is a data-model rework, not an async swap.
- **`src/pages/documents/Vault.tsx`** / **`PlotView.tsx`** documents tab — needs real S3/MinIO-backed file URLs behind "Download", not just metadata (the QR "verify" modal is also still a fake random pattern, not a real QR code).
- **`src/pages/checkout/Checkout.tsx`** — the seam now exists (`checkoutService.ts`) but still needs an actual gateway behind it: real Paystack/Opay API keys, a redirect-and-return flow (paystack), and webhook-based confirmation instead of a simulated delay.
- **Support's live-chat panel** (`Support.tsx`) — canned auto-replies are local component state by design; would need a real chat/messaging backend to migrate meaningfully.

## Known simplifications vs. the real platform

- **Reviews**: any logged-in user can currently post a review. The real system's rule is that only a buyer with a verified, finance-approved *completed transaction* on that estate may review it — not enforced here since there's no transaction data to check against yet.
- **Multi-tenancy**: this UI has no concept of tenants/companies/branches at all — it assumes a single company. The real platform is hierarchically multi-tenant (Super Admin → company → branch), which will need real UI work (tenant-scoped views, branding), not just API wiring.
- **Plot geometry**: plots are a simple `row`/`col` grid grouped into visual "blocks" for the street-map look. The real backend stores actual PostGIS polygons — `PlotCanvas.tsx` will need real rework to render real geometry, not just point at a new endpoint.


## Asks for the backend session (2026-09-26 contract audit)

Two gaps the frontend cannot close on its own. Everything else found in the audit has been fixed on this side; these two would mean degrading the product to match a missing capability, so they are written up instead.

### 1–3. Resolved by the backend (2026-09-27/28), wired or confirmed here 2026-09-30

- **`EstateEligibility` on `EstateDetailDto`** — arrives as `EstateEligibilityDto`, eight booleans including an explicit `noBlockingConflict`. The frontend type already matched field for field, so the estate detail's readiness panel shows real conditions with no change. List rows still read "Readiness unknown", correctly: `EstateSummaryDto` carries no eligibility.
- **`tenantId` / `branchId` on `AuthUserResponse`** — populated from the tenant scope. `usePortalScope` reads them straight off the signed-in user; nothing in the frontend calls `/api/me` or `/api/me/tenant-scope`.
- **`POST /api/auth/change-password`** — `/change-password` now verifies against the current password. The forgot → reset workaround is gone from that screen; `/forgot-password` → `/reset-password` is unchanged for people who have actually forgotten.

## Asks for the backend session (2026-09-30 cross-check)

### A. Refresh — resolved 2026-09-30 (backend `91024a3` + `cf8983e`)

The refresh token is the HttpOnly `lv_refresh` cookie; no body carries it and no frontend code touches it. Refresh returns `{ user, token }`, and one refresh on page load restores the session (`AppContext`; mock mode keeps its demo user). Refresh is serialised across tabs with `navigator.locks` ("lv-refresh"), and a tab that waited reuses a token another tab already obtained instead of refreshing again. Without `navigator.locks` (a LAN IP over http, or Node) it falls back to per-tab single-flight, and the backend's 10-second grace window covers the rest. Logout takes the same lock and drops the access token even if the call fails. Login, register, 2FA verify and change-password send `credentials: "include"`. Login, 2FA verify and change-password also skip the refresh interceptor.

**Origin, as it actually behaves:** from a disallowed origin, Spring's CORS check rejects the request before the Origin guard runs, so the browser sees "Failed to fetch", not a readable 403 `ORIGIN_NOT_ALLOWED`. Confirmed live from `localhost:5199`. Both are shown as a configuration banner, never as a sign-out. The backend docs still describe it as a 403.

### B. No list endpoints for blocks or price tiers, and no per-tier plot count

There is no `GET .../blocks`, `GET .../price-tiers` or `GET .../plot-counts`; the inventory service was calling all three. They are now read off `GET /api/portal/estates/{id}` (`blocks`, `priceTiers`, `plotCounts`). `PriceTierDto` has no plot count, so the tier table takes each tier's total from `.../impact` (one request per tier — a handful). A `plotCount` on `PriceTierDto`, or the same `PlotCountsDto` per tier, would save those requests.

### C. `pricePerSqm` isn't on `PriceTierDto` (or `PlotDto`)

The tier table's "Per sqm" comparison column reads "—" against a real backend. The frontend deliberately doesn't divide one out (figures arrive computed). If the comparison is wanted, it needs to come from the server.

### D. Estates show their branch as a raw UUID

`PortalEstateList` and `PortalEstateDetail` render `{estate.branchId} branch`. That read fine against mock slugs ("heritage branch"), but against the backend it prints a UUID. A branch name on the estate DTOs, or a branch lookup, would fix it.

### E. Inventory slice 3, plot import, estate editing — wired 2026-10-04 (backend `924f973`)

Wired: withhold/return and bulk status with dry-run preview (`PUT .../plots/{id}/status`, `POST .../plots/status`), retire/reinstate tiers, plot import (template, multipart preview, all-or-nothing import whose 422 body is read as the report), `PUT /api/portal/estates/{id}`, and `POST .../boundary`.

**Fixed while wiring:** `createPortalEstate` sent the boundary as `boundary`; `CreateEstateRequest` calls it `footprint`, and Jackson dropped it silently. Every estate created through the portal against a real backend came out with no boundary, which after BG-1 means it could never be published.

**Also wired since:** correcting a plot's boundary (IE-9), moving a plot between tiers (IE-10), withdrawing a plot (IE-11), and SB-1. SB-1 covers the state-check errors shown with the state they name, the GRID3 / geoBoundaries attribution wherever the check applies, and the Super Admin override at `/admin/estate-state-override`.

**Gap for the backend:** there is no admin endpoint that lists or reads estates, and the override isn't on any read DTO. So the override screen starts from an estate id the developer quotes (the portal shows it when a boundary is refused), and it can't show whether an override already exists until one is set or removed. **Mock mode** doesn't run the state check at all: it has no state polygons, and says nothing rather than pretend.

### F. Branches, staff and invitations — wired 2026-10-06 (backend `16bfff3`, `6dfa23f`)

Wired:
- Branches with their public office details (`/portal/branches`).
- Company-level estates. "No branch" is an explicit choice on New estate, and branch staff see such estates read-only (EB-2).
- Invitations: invite, branch request, approve, reject, cancel, revoke and resend.
- The public `/accept-invitation` page, which reads the token from `#token=` and signs the person in.
- Staff management: role change, deactivate and reactivate.
- The three new permissions, plus the FP-1 wording for a listing that went dark because it has no boundary.

**Found while wiring:** the mock branch manager held `portal.estates.manage`. Changeset 041 grants that only to `executive_director` and `surveyor_project_manager`, so the portal was offering branch managers estate creation and editing that the real backend refuses. Corrected, and the add-tier, add-block and add-plots forms are now gated on it too.

**Asks for the backend:**
1. **No endpoint lists roles.** Names and scopes are hard-coded in `staffService.ts` from changesets 015/067. A `GET /api/portal/roles` returning `{code, name, scope}` would remove the copy.
2. **Changing an estate boundary isn't supported** (`BOUNDARY_ALREADY_SET`), so a correction can't be offered.
3. **Conflicts aren't itemised.** Estate and plot boundary results report counts or a blocked flag, not which conflicts resolved or were raised.
4. **Import maps tiers by exact value only.** It can't map a file value (e.g. `zone = A`) to a tier: only the property *name* is configurable.
5. **Stale Javadoc:** `CreateEstateRequest` still says `branchId` is required for an Executive Director (EB-1 made it optional).
6. **No `X-Branch-Id` branch switcher** for directors yet; the portal always acts company-wide for them.

### Also worth a look, lower priority

- **`POST /api/auth/login`'s OpenAPI description says to "check for a `challengeId` field".** `TwoFactorChallengeResponse` has no such field — it is `challengeToken`. The frontend discriminates on `twoFactorRequired`, which is unambiguous, but the description is misleading and worth correcting.
- Login's Javadoc still says "OTP is a TODO" even though `TwoFactorController` is complete — the frontend is now wired to the real challenge/verify pair, so that comment is stale.
- *(Resolved on the frontend 2026-09-26: the cosmetic OTP step is gone, and `mustChangePassword` / `mustSetUpTwoFa` / `recoveryCodesRemaining` are all routed on or displayed.)*
