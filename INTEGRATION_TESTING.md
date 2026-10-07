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

**Misaligned** (the backend has it; the frontend is not rewired)
- `/estates` plot-grid browse. It needs every plot with a grid position. The
  backend serves listings and a map instead. `/marketplace` is the live buyer
  entry point.

**No backend yet** (demo data by design)
- portfolio and payment schedules
- document vault
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

1. **No payment endpoints, and no way to cancel a pending purchase.** A
   purchase stops at *pending payment*, and the plot stays held until finance
   verifies a payment, which can't happen yet. The checkout warns about this
   on the plan step and offers "Release this plot" there. Once the purchase is
   recorded, `DELETE /api/reservations/{id}` returns 409.
2. **Plots without a boundary are invisible to buyers.** The marketplace map
   (`/geojson`) is the only public plot list, and it omits plots with no
   footprint. The picker notes when a tier has more plots remaining than it
   can show.
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
