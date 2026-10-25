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

**Asks for the backend** (1–4 and 7 resolved by `9cef857`, see G):
1. **No endpoint lists roles.** Names and scopes are hard-coded in `staffService.ts` from changesets 015/067. A `GET /api/portal/roles` returning `{code, name, scope}` would remove the copy.
2. **Changing an estate boundary isn't supported** (`BOUNDARY_ALREADY_SET`), so a correction can't be offered.
3. **Conflicts aren't itemised.** Estate and plot boundary results report counts or a blocked flag, not which conflicts resolved or were raised.
4. **Import maps tiers by exact value only.** It can't map a file value (e.g. `zone = A`) to a tier: only the property *name* is configurable.
5. **Stale Javadoc:** `CreateEstateRequest` still says `branchId` is required for an Executive Director (EB-1 made it optional).
6. **No `X-Branch-Id` branch switcher** for directors yet; the portal always acts company-wide for them.
7. **`TenancyExceptionHandler` reports every data-integrity conflict as `RC_NUMBER_ALREADY_REGISTERED`.** That's fine while RC number is the only unique field a tenant create can hit, but any other constraint would be mislabelled as a duplicate RC number. The tenant wizard trusts the code and sends the user back to the RC number field.

### G. Backend `9cef857` ("frontend raised issue fixes") — wired 2026-10-06

The asks in F, now built on both sides:
- **Roles:** `GET /api/portal/roles` drives the invite and role-change forms. Roles the caller can't grant (`canGrant: false`) are shown but disabled, and scope arrives lowercase. `MOCK_ROLES` stays only as mock data.
- **Estate boundary correction (FP-2):** the estate page has *Correct the boundary* and a boundary history with *Withdraw*. A published estate whose land changes by more than 5% returns 202 `pending`. The Super Admin reviews it at `/admin/boundary-changes`, which shows both shapes on one map.
- **Itemised conflicts:** add-boundary, estate correction (and its approval) and plot correction all show raised, resolved, awaiting review and still open, through `ConflictChangesView`.
- **Import tier mapping (FI-6):** the import page lists the file's distinct tier values and lets each be mapped to a tier, sent as the `tierMapping` form field.
- **Tenant-create errors:** `DUPLICATE_RECORD` is no longer reported as an RC-number clash; the wizard only sends the user to the RC field on `RC_NUMBER_ALREADY_REGISTERED`.

**Fixed while verifying:** `EstateBoundaryMap` clipped its own legend. The legend sat inside the fixed-height, overflow-hidden map box, so no legend passed to it had ever been visible, including the inventory's plot-status legend.

### H. Instalment plans — wired 2026-10-22 (backend changesets 099–103)

Built from the Figma page "Screen — Instalment plans". The rule throughout: **the frontend does no money arithmetic**. Every deposit, instalment, plan total, premium, balance and penalty is the backend's.

- **Portal, Fees & terms › Payment plans** (`paymentPlansService.ts`, `PaymentPlansPanel`): `GET|PUT /api/portal/estates/{id}/payment-plans`. One deposit type per plan, limits checked before sending, `[]` for outright only. Shows the response's `quotes` per tier (non-corner) and names a tier a fixed deposit left out. The estate page has a *Payment plans* setup card.
- **Marketplace:** `priceTiers[].paymentPlans` is mapped onto `PriceTier`. A listing offers instalments only when a tier has a plan, so the old "every listing accepts every plan" assumption is gone. The *Instalments* filter is applied to the tiers locally, because the backend has no such filter. The booking card lists each plan's figures. The late-payment row is priced on one instalment (`penaltyBasisPlan`, `penaltyBasisInstalment`).
- **Checkout:** the picker lists the tier's declared plans, and the hard-coded 20% deposit and duration dropdown are gone. It sends `{ plan: "installment", planId }`, never `installmentMonths`. 409 `PLAN_NOT_OFFERED` reloads the listing and asks again. The purchase's `schedule` drives the deposit amount, the offer step and the order summary.
- **Paying:** `startPayment(id, { balance })` uses `?balance=true` for a pay-off. The purchase page has *Your plan* (verified of plan total, n of N, the next instalment), the fixed schedule, payment history and the provisional letter. Pay is labelled from state, and pay-off confirms then shows the backend's amount before Paystack. Pay is disabled while a payment awaits verification. New refusals handled: `INSTALMENT_AWAITING_VERIFICATION`, `NOTHING_TO_PAY_OFF`.
- **Return page** words itself from the purchase: a deposit, or an instalment / pay-off on `on_plan`.
- **Statuses:** transaction `on_plan` ("On instalment plan"), plot `on-plan` ("On plan"), and document `provisional_allocation_letter` (vault, verify page). The portfolio row shows plan progress and "n of N instalments paid". A plan plot's page links to its purchase page instead of the old demo schedule.
- **Finance:** rows say what they're for (`paymentFor`, `planName`, `instalmentSequence`, `instalmentCount`, `dueDate`). Verify reads "Verify deposit — hold plot on plan", "Verify instalment" or "Verify — sell plot & issue allocation letter", and the toast follows the response's `status`. Reject on a plan payment says only that payment is refunded. `LATE_DEPOSIT_NOT_SUPPORTED` has its message. The "Paystack received ₦X less" line no longer subtracts in the browser.
- **Payouts:** `tranche`, `trancheLabel`, `trancheAmount`, `heldInEscrow` on the ready list. The row title is the tranche label, and plan rows say what HomeTrue holds in escrow. `HELD_IN_ESCROW` shows as information. Payout history and the developer's read-only list group and label by tranche.
- **Demo mode** stands in for the backend in one place (`mockQuote`, `mockSchedule`, `mockDue`): the premium on the price, a percentage deposit of the plan total, the rest split evenly with the leftover kobo on the last instalment. Plan payments made from the purchase page appear in the demo finance queue, and verifying them moves the plan on as the backend does.
- **Money with kobo:** `formatMoney` (`lib/formatCurrency.ts`) shows kobo when there is any (₦1,796,666.66), so a plan figure is never rounded.

Out of scope (phases 4–5, not on the backend): arrears, penalties charged, reminders, revocation, withdrawal, restructure.

### I. Instalment plans, phases 4–5 — wired 2026-10-24 (backend PRs #24–#28)

Built from the Figma page "Screen — Instalments: arrears, withdraw, revoke, restructure". As in H, **no money arithmetic and nothing stored about lateness**: every status, days late, penalty, refund and share is the latest response's, for today in Lagos. **No demo data** for any of it, per the brief: in demo mode the lists are empty and the actions say they need the live service.

- **Phase 4 — arrears and penalties.** `Purchase.standing` (`status`, `instalments[]` with `status`/`daysLate`/`penalty`, `arrears`, `revocation`, `restructureStatus`) drives:
  - a calm, warning-tinted arrears panel on the purchase page;
  - a status chip;
  - each schedule row's status and its penalty on its own line;
  - the Pay flow for a late instalment: the instalment and its penalty side by side, then the backend's `PaymentDto.amount`/`penaltyAmount` before Paystack.
  - Awaiting verification is never late. A carried penalty (`monthsLate 0, penaltyPct 0`) reads "carried from before the restructure".
  - Payment history shows "includes ₦X late-payment penalty".
  - Portfolio: `in_arrears`, `withdrawn`, `revoked`; the arrears line shows `totalDue` and the penalty; a restructure badge appears while one is open.
  - Listing: `penaltiesRefundable`, plus the revocation sentence built from `afterMonthsUnpaid`/`noticeDays`.
- **Default terms (wire change).** `revocationTrigger`/`onRevocationRefund` are gone. `revocationAfterMonths` (3–120, required) and `revocationNoticeDays` (≥ 14, optional) are entered as numbers in one sentence. `penaltiesRefundable` is asked only when there are penalty steps. `DefaultTerms` returns `noticeDaysGiven`.
- **5a — withdraw** (`/purchases/:id/withdraw`, `planService.fetchWithdrawal`/`withdraw`):
  - the quote comes first: paid, comes back, developer keeps, then each payment; a payment awaiting finance counts as paid;
  - then an "I understand" tick before confirming;
  - the POST names the quote's `refund`; `WITHDRAWAL_QUOTE_CHANGED` reloads the quote and asks again;
  - once withdrawn or revoked, the purchase page lists each payment's refund, with the bank-account step (`RefundPanel`) where needed.
- **5b — revoke.**
  - Buyer: the notice of revocation sits at the top of the purchase page (Pay now · See withdrawal figures · Ask to restructure); `revocableFrom` is a quiet line in the arrears panel.
  - Portal: on `/portal/finance/plans/:id`, an Executive Director with `portal.plans.revoke` (added to the permission list and the roles catalogue) sees what revoking would mean, gives notice with a reason, withdraws a notice, and confirms from `confirmableFrom` behind a confirm dialog. The notice history is listed, and every `REVOCATION_*` code has words.
- **5c — restructure.**
  - Buyer (`/purchases/:id/restructure`):
    - ask (reason, preferred instalments);
    - wait, with a Withdraw request link;
    - see the proposal side by side with today's plan, with the carried penalty, the total unchanged and the deadline;
    - read the restructure letter (`/api/documents/restructure-letters/{id}/pdf`), then Accept or Decline, which sends the proposal's id;
    - the history lists earlier requests.
  - Portal: a Restructures tab; on the plan page, propose with a debounced live `preview`, or reject with a reason, or withdraw a proposal.
- **Finance:**
  - a Running plans tab with filter chips (most urgent first);
  - queue rows show `penalties[]` as their own lines;
  - `planWithdrawn`/`planRevoked` rows explain that verifying releases only the developer's share, and their Verify reads "Verify — release your share".
  - Decisions answering `withdrawn`/`revoked` are worded for it.
- **Payouts:** `WITHDRAWN_PLAN_PAID`/`REVOKED_PLAN_PAID` are shown as information.
- **Documents:** `restructure_letter` in the vault (its own tab when there are any) and on the verify page. Statuses `withdrawn`/`revoked`/`declined` have labels.

Out of scope: developer-initiated restructures, reminder emails, reinstating a plan. (Penalty waivers were added after phase 5c: see J.)

### J. Penalty waivers — wired 2026-10-25 (backend changeset 109, `feature/penalty-waivers`)

Built from the Figma "Penalty waivers" page (developer plan page, Running plans, buyer schedule).

- **Developer** (`portal.payments.verify`; the plan route is already gated on it): a "Late-payment penalties" table on `/portal/finance/plans/:id` from `GET /api/portal/plans/{id}/penalty-waivers` — instalment, due date, status, reached / waived / outstanding. "Waive" opens a form under the row: amount prefilled with `outstanding` (checked ≤ it client-side as a convenience — `checkWaiver`), required reason (≤ 500, "the buyer is emailed this"), the fixed-amount sentence, then a confirm dialog before `POST`. The screen redraws from the response. History: instalment, date, amount, reason, newest first. No "by whom": `waivedBy` is a user id only. Empty: "No penalties to waive on this plan."; plan not `on_plan`: history only.
- **Errors**: the backend's `message` is shown. `WAIVER_TOO_LARGE` and `VALIDATION_ERROR` `fieldErrors` go under their fields; `PENALTY_NOT_WAIVABLE` shows the message and re-fetches (the screen was stale); `OWN_PURCHASE` and the rest under the form.
- **Running plans**: "Waive penalty" beside "Open plan" on rows whose `arrears.penaltyAmount` > 0 (`?section=penalties`).
- **Buyer**: `standing.instalments[].penaltyWaived` is read; the penalty shown stays the net one. "₦X waived by the developer" under the instalment; fully waived reads "Late-payment penalty of ₦X waived by the developer". No buyer request flow.
- **Also from the Figma page**: a restructured schedule says "Restructured on {date} · version n" (date = the accepted restructure's `acceptedAt` from `GET /api/transactions/{id}/restructure`); the schedule card stacks per payment on a phone; the plot page's instalment list uses the status tokens and badges instead of raw red/amber/emerald.
- **Not checked live**: the backend running on 8080 predates changeset 109 (its waiver code was still uncommitted on `feature/penalty-waivers`), so the GET answered 404. The screens were checked against the Figma frames with the two GETs answered from fixtures in the browser; nothing was posted. The "Done means" walkthrough (backdated instalment, waive part then the rest, buyer email) is still to do once the backend is restarted on that branch.
- No demo data (by design): in demo mode the section says it needs the live service.

### K. Phases 4–5 screens aligned with the Figma frames — 2026-10-25

An audit against the approved Figma frames found the buyer, portal and terms screens had drifted. Fixed, all from data already sent:
purchase title chip from `standing` (In arrears / Overdue / Notice of revocation, plus Restructure requested/proposed); no "held for
you" panel while late; Your plan card without a second chip; calm warning tone instead of red on the portfolio and plot page; the
restructure page's intro, history (the open request and its proposal), folded new-instalment list, late row and "Plan restructured on…"
after accepting; the plan page title's restructure badge; inline revocation inputs and units on default terms; "· Buyer withdrew" and
the house date format on the finance queue; plot, estate and plan on the withdraw page.

**Waiting on the backend** (asked in `~/Documents/hometrue-backend-figma-alignment-fields-prompt.md`): per-instalment standing on a
portal plan ("Current schedule" card), the refund on a withdrawn portfolio entry, `instalmentAmount` on queue items, `confirmableFrom`
on running-plan notices, `planName` and `planStartedAt`/`endedAt` on portfolio entries. Those spots keep their current wording until then.

### Also worth a look, lower priority

- **`POST /api/auth/login`'s OpenAPI description says to "check for a `challengeId` field".** `TwoFactorChallengeResponse` has no such field — it is `challengeToken`. The frontend discriminates on `twoFactorRequired`, which is unambiguous, but the description is misleading and worth correcting.
- Login's Javadoc still says "OTP is a TODO" even though `TwoFactorController` is complete — the frontend is now wired to the real challenge/verify pair, so that comment is stale.
- *(Resolved on the frontend 2026-09-26: the cosmetic OTP step is gone, and `mustChangePassword` / `mustSetUpTwoFa` / `recoveryCodesRemaining` are all routed on or displayed.)*
