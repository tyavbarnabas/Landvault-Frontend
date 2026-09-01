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

- **`estatesService.ts`** — `Browse.tsx`, `EstateDetail.tsx`, `Resale.tsx`, `Checkout.tsx`, `Upgrade.tsx`, `Syndicate.tsx`, `Dashboard.tsx`
- **`reviewsService.ts`** — `EstateReviews.tsx` (mounted on `EstateDetail.tsx`)
- **`authService.ts`** — `AppContext.tsx`, `Login.tsx`, `Register.tsx`
- **`portfolioService.ts`** (owned plots + payments) — `Dashboard.tsx`, `Portfolio.tsx`, `PlotView.tsx`, `Upgrade.tsx`, `Support.tsx`, `Resale.tsx`
- **`documentsService.ts`** — `Vault.tsx`, `PlotView.tsx`
- **`syndicatesService.ts`** — `Syndicate.tsx` (`SyndicateList`, `CreateSyndicate`, `SyndicateDetail`); creating a syndicate now actually persists it (mock store) and the "Open dashboard" link goes to the real created id, not a hardcoded one
- **`disputesService.ts`** — `Support.tsx`'s disputes tab; the live-chat tab intentionally stays local component state (it's a scripted demo bot, not real backend data — nothing to migrate until a real chat backend exists)
- **`checkoutService.ts`** — `Checkout.tsx`. Models the real shape of a payment flow (reserve → initiate payment → confirm) so a real gateway integration later means filling in three functions, not restructuring the page. **This does not talk to a real payment gateway** — there are no Paystack/Opay credentials or webhook handling here; mock mode simulates the same outcomes the UI always assumed. A successful mock payment now calls `portfolioService.addOwnedPlot()`, so checkout actually produces a real entry in Portfolio/Dashboard/Vault instead of just showing a cosmetic success screen.
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
