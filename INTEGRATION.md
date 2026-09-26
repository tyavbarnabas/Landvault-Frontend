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

### 1. Expose `EstateEligibility` on `EstateDetailDto`

The backend already computes all seven booleans (`published`, `tenantVerified`, `tenantEntitled`, `tenantActive`, `feesDeclared`, `refundTermsDeclared`, `eligible`) in `marketplace_estate_eligibility`, and `EstateEligibility`'s own Javadoc says they are separate *precisely so* the failing one can be named. But the record isn't on any portal read DTO, so the only way the portal can learn about a failure is to attempt a publish and catch `PublicationRefused`.

The portal's readiness panel therefore renders every condition as **Unknown** against a real backend — it must never show an unknown condition as met, so it cannot guess. Adding the record to `EstateDetailDto` turns the panel on with no other frontend change; the field is already modelled as `eligibility: EstateEligibility | null` and the null branch simply stops being taken.

Worth noting the conflict check has no boolean of its own: the frontend infers a blocking conflict from "every named condition passes but `eligible` is false". An explicit `noBlockingConflict` (or exposing `ConflictPublicationCheck`) would remove that inference.

### 2. Put `tenantId` and `branchId` on `AuthUserResponse`

`AuthUserResponse` carries neither today. `tenantId` is available from `GET /api/me`, and `branchId` only from `GET /api/me/tenant-scope` — whose own Javadoc calls it a debug endpoint for observing the tenant-context filter, not a product endpoint.

Branch scoping is enforced server-side by RLS either way; this is about the portal knowing its own scope well enough to label the UI honestly ("your branch's estates" vs "every estate across your company's branches") without a second round trip to a debug surface. `AuthUser.tenantId`/`branchId` are already optional on the frontend for exactly this reason.

### Also worth a look, lower priority

- `POST /api/auth/login`'s Javadoc says "OTP is a TODO", but `TwoFactorController` and `TwoFactorChallengeResponse` exist. The frontend's login still runs a **cosmetic** OTP step that accepts any six digits; it should be wired to the real challenge/verify pair, which needs the login response's shape for a 2FA-required outcome pinned down.
- `AuthUserResponse` carries `mustChangePassword`, `mustSetUpTwoFa` and `recoveryCodesRemaining`, which the frontend now models but does not yet route on — no change-password or 2FA-setup screen exists.
