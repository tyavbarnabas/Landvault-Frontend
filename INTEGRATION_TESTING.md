# Testing against the real backend

The frontend can run fully mocked, or against the Spring Boot backend
(`~/IdeaProjects/landvault-backend`). Each feature is switched on its own:
`src/lib/backends.ts` lists every service as **live**, **misaligned** or
**no_backend**. Only live services call the backend. Everything else keeps its
demo data and says so.

## What must be running

| Thing | Where | Notes |
|---|---|---|
| Postgres | `docker compose up -d` in the backend repo (port 5433) | PostGIS image |
| MailDev | same compose file, web UI on http://localhost:1080 | invitation and reset emails land here |
| Backend | `./mvnw spring-boot:run`, port 8080 | `SPRING_PROFILES_ACTIVE=dev`, `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, `KYC_ENCRYPTION_KEY` set in its `.env` |
| Frontend | this repo, port **8443** | `VITE_API_BASE_URL=http://localhost:8080` in `.env.local` |

**The port matters.** The backend's `CORS_ALLOWED_ORIGINS` defaults to
`http://localhost:8443`. From any other origin, every request fails as "Failed
to fetch". The dev panel (bottom right) turns red when the origin is wrong.

## First run: getting a super admin and a tenant

1. Start the backend once with `BOOTSTRAP_SUPER_ADMIN=true` and the
   `BOOTSTRAP_SUPER_ADMIN_*` values set. It creates the admin and then does
   nothing on later starts. Turn the flag off again.
2. Sign in as that admin. The backend requires a password change and 2FA setup
   first (`mustChangePassword` / `mustSetUpTwoFa`).
3. **Admin → Tenants → New tenant.** This creates the tenant and invites its
   Executive Director. The final "submit for verification" step fails today
   (see backend gaps). The tenant still exists, and the page says what happened.
4. Open the invitation email in MailDev, accept it, and sign in as the director.
5. In the portal: create an estate (draw or paste a boundary), add price tiers
   and plots **with boundaries**, add fees, then publish.
6. Sign up as a buyer. The estate appears in the marketplace, and the buyer can
   reserve a plot and start a purchase.

## How to tell real from demo

- **Dev panel** (bottom right, dev builds only): lists live services and mocked
  services, with reasons.
- **Demo-data banner** (top of the page): appears only when a backend is
  configured and the page used a mocked service. It names each one.
- **Console**: a table of every service's mode at startup, and a `[mock] …`
  line the first time each mocked service serves data.
- **Errors**: a failed screen names the service, method, path and status, or
  says the backend couldn't be reached at all (down, wrong port, or CORS).

## Status by feature (audited against backend commit 9cef857)

**Live**
- sign-in, 2FA, password change and reset, refresh cookie
- KYC
- tenants (Super Admin)
- listing conflicts
- state overrides
- portal estates and boundary changes
- inventory: tiers, blocks, plots, import
- fees and terms
- branches
- staff, roles and invitations
- **the purchase flow, as one group**: marketplace listings, plots (from the
  estate map), the public cost disclosure, reservations, and transactions
- portfolio (outright purchases; installment plans have no backend yet)
- document vault: receipts and allocation letters, downloaded as PDF or one
  stacked JPEG with the bearer token. Read-only: voiding and reissuing are
  mock-only (the demo resale and upgrade flows)
- public document verification (`/verify/:code`, no login)
- allocation letter setup (Portal → Letters): letterheads, signatory,
  signature/logo/seal uploads, letter wording; per estate, its conditions,
  the preview and the director's approval

**Retired when live**
- `/estates` plot-grid browse. Real plots have boundaries, not grid positions,
  and the backend has decided not to add any. With a backend configured,
  `/estates` redirects to `/marketplace`, `/estates/:id` redirects to
  `/marketplace/:id`, and the Estates menu item is hidden. Mock mode keeps the
  grid.

**No backend yet** (demo data by design)
- payment schedules (installments)
- dashboard attention list
- upgrades
- resale
- inspections
- enquiries
- reviews
- syndicates
- disputes
- notifications
- construction updates
- Super Admin metrics
- AGIS lookup

## Backend gaps found while integrating

1. ~~No payment endpoints.~~ **Resolved:** Paystack payments, finance
   verification, payouts and refunds are live (see "Payments" below). An
   unpaid purchase ends by itself (`abandoned`) when its hold runs out.
2. ~~Plots without a boundary are invisible to buyers.~~ **Resolved:**
   `GET /api/marketplace/estates/{id}/plots` lists every plot, with
   `hasBoundary`. The picker lists them marked "boundary not surveyed", and
   the plot panel warns the buyer. The portal estate page warns the developer
   using `plotsWithoutBoundary`.
3. **No tenant document upload.** `submit-documents` fails with
   `NO_DOCUMENTS_UPLOADED`. The onboarding wizard's documents, regulatory
   details, directors and financials are not stored anywhere.
4. **Unit-type tiers have no size** (`sizeSqm: null`). The frontend shows
   "Unit".
5. **No admin estate list.** State overrides work per estate id only.
6. **The marketplace map carries no prices.** Prices come from the tier plus
   the corner premium, as the backend documents.
7. **No KYC review queue.** `GET /api/admin/kyc/{userId}` needs a user id,
   and nothing lists the submissions waiting for review. The frontend has no
   admin KYC screen either. A buyer's KYC can only be approved by calling
   `POST /api/admin/kyc/{userId}/decision` directly.
8. **`mustChangePassword` is enforced only on the login redirect.** Neither
   side blocks other routes, so typing an admin URL skips the forced change.
9. **The tenant list is a summary** (`TenantSummaryDto`), with no estate
   counts. Seeded tenants can have `primaryContact: null`.
11. **No password rule on the backend.** `RegisterRequest`, reset,
    change-password and invitation accept only require a non-blank password,
    so anyone calling the API directly can set "1". The frontend enforces one
    shared rule (`src/lib/passwordPolicy.ts`): at least 8 characters, letters
    and a number, not a common password, not the user's own name or email.
    The backend should enforce the same rule and answer with a readable code
    (for example `WEAK_PASSWORD`); the frontend already shows the backend's
    message as-is.
10. **Conflicts carry no geometry** in the list, so the overlap diagram shows
    only in mock mode.

## Found and fixed during the first live run (2026-10-07)

Each of these passed in mock mode and broke against the real backend:

- **Register** sent `name` instead of `firstName`/`lastName`, and never sent
  the password. The backend rejects unknown fields. Phone is required live,
  and the mock-only emailed-code step is skipped.
- **KYC** sent `File` objects, which serialise to `{}`. It now sends file
  metadata (`fileName`, `fileSize`, `storageKey`). A `submitted` result showed
  as a rejection; it now says "waiting for review" with a "Check again" button.
- **Tenant directory** expected full tenants, but the backend returns
  summaries. It crashed.
- **Tenant detail** crashed on `primaryContact: null`.
- **Listing conflicts** sent `?status=undefined` (400), then crashed on the
  missing footprints.
- **Admin dashboard metrics** (mocked) were computed from the live tenant
  list.
- **The marketplace feed** mixed demo resale listings in with real ones. They
  are hidden while resale has no backend.
- **USD-priced tiers** were converted as if they were NGN.
- **Checkout:**
  - a refused reservation or transaction left the spinner running forever
  - the hold countdown kept running after the purchase was recorded

## Honesty rules for listings (2026-10-07)

- `verified` on a listing means the **developer company** is verified, not the
  land. It is labelled "Verified developer", never just "Verified".
- A missing `titleType` shows "Title not recorded". A missing
  `lastVerifiedDate` shows "Land not checked yet". The frontend used to fill
  in "Gazette" (in both the marketplace and the portal); it no longer does.
- The "Verified only" filter is hidden when live, because every listed
  developer is verified.
- No backend change is needed: the field is accurate, and only the label
  misled.

## Plot list paging (2026-10-07)

The plot picker loads one size tier at a time, 20 plots per page, from
`GET /api/marketplace/estates/{id}/plots?priceTierId=&available=true&limit=20&cursor=`,
with Previous/Next. It shows available plots by default, with a "Show
unavailable plots too" option. The whole estate is no longer loaded for the
list.

- The backend must be restarted after adding `priceTierId`. An older backend
  ignores the filter: the frontend still hides other tiers' plots, but the
  counts and page numbers come out wrong.
- **Backend:** plot numbers are sorted as text (1, 10, 11, …, 2). They should
  be sorted as numbers (1, 2, … 10).

## Payments (2026-10-09)

Built from the backend's payments brief, Sections 1–9, and checked against
the backend's code. Every screen below calls the real backend when one is
configured, and has a demo-mode stand-in.

| Who | Where | What |
|---|---|---|
| Buyer | checkout → **Pay with Paystack** | outright purchases in naira; Paystack's page takes card or transfer |
| Buyer | `/payments/return` | asks the backend (`/verify`); never assumes; checks every 5s for about 2 min |
| Buyer | `/purchases`, `/purchases/{id}`, dashboard | the server's status; "The plot is yours" **only** when `verified` |
| Buyer | purchase page → refund | refund progress; bank account form (no name field) for bank-transfer refunds |
| Finance officer / director | Portal → **Finance** | verify or reject (with Paystack's record beside the price), late payments, payouts (read-only) |
| Director | Portal → **Payout account** | submit or withdraw; the bank's name for the account is shown back |
| Super Admin | **Payout accounts** | approve or reject, with name and onboarding warnings (never blockers) |
| Super Admin | **Payouts** | pay out the next part of a sale (₦10M cap per transfer), Paystack code dialog; finish or cancel stuck ones from History |
| Super Admin | **Refunds** | refund the full amount; send to the buyer's account after checking the bank's name |

**With a backend, the buyer dashboard shows only what has a backend:** real
purchases, owned plots and documents. The demo attention list and payment
schedule are hidden, so "₦3.2M overdue" never sits beside real purchases.

**Proven live:**
- reserve → purchase → Paystack page opens
- purchase page and return page (processing, unknown payment)
- the real bank list (288 banks)
- the buyer's purchase list and dashboard

**Still to run live** (it needs the Super Admin's authenticator and a
developer finance login) — the brief's acceptance check:
1. The buyer reserves a plot and pays by bank transfer (Paystack test mode).
2. The return page shows "being verified".
3. Finance verifies, and the buyer sees "The plot is yours".
4. The Super Admin approves the developer's payout account.
5. The Super Admin pays out a ₦15M sale as 2 × ₦7.5M, with a code for each part.
6. The developer's Finance → Payouts shows both parts as paid.
7. The Super Admin refunds a rejected purchase, and the buyer sees "Refund paid".
8. A late payment shows in Late payments and can be allocated.

**Open items for the backend:**
- The "refund needs your bank account" email has no link. It could point to
  `/purchases/{transactionId}`.
- The purchase doesn't carry its hold's end time, so the purchase page can't
  show a countdown.
- The finance, payout and refund lists aren't paged.
