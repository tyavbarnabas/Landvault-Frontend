import type { NigerianState } from "./nigerianStates";

export type PlotStatus = "available-dev" | "available-inv" | "reserved" | "sold";
export type PaymentPlan = "outright" | "milestone" | "installment";
export type Currency = "NGN" | "USD" | "GBP" | "EUR";
export type KYCStatus = "unsubmitted" | "submitted" | "under_review" | "approved" | "rejected";

export interface Plot {
  id: string;
  row: number;
  col: number;
  sqm: number; // nominal tier size — what it's priced and sold as
  actualSqm: number; // representative surveyed area — display only, never priced off this
  price: number; // NGN — this tier's own developer-set price; a corner plot's price already includes the estate's corner premium
  orientation: "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW";
  type: "standard" | "corner";
  status: PlotStatus;
  intent?: "development" | "investment";
  projectedROI?: number;
  holdingYears?: number;
}

// A verification check's own honest state — status must never be inferred
// from silence. Absent entirely (the field left undefined on Estate) means
// "don't render this line at all"; present-but-not-"verified" means render
// the true state plainly. See EstateDetail.tsx's DetailSection.
// TODO (backend): backed by a real AGIS / state-registry integration —
// this mock has no such integration, so these are hand-set per estate.
export interface VerificationCheck {
  status: "verified" | "pending" | "not_checked" | "failed";
  date?: string;
  note?: string;
}

// The ONE canonical estate model — see landvault-catalogue-unification-plan
// in project memory. Previously this file and marketplaceService.ts each
// held their own unrelated fixture set, bridged only by a state-name lookup
// table; every estate a tenant owns now lives here, and
// marketplaceService.ts's projectListing() derives the public marketplace
// listing FROM this (never a second, independently-authored catalogue).
export interface Estate {
  id: string;
  name: string;
  // Real-estate identity — `location` is a derived convenience ("area,
  // city") kept because most internal pages already render it directly;
  // `area`/`city`/`state` are the structured fields the public marketplace
  // projection actually needs (marketplaceService.ts's Estate/Listing shape).
  area: string;
  city: string;
  state: NigerianState;
  location: string;
  // Ownership — which tenant/branch this estate belongs to. Drives the
  // marketplace publication gate and the Seller shown on a published
  // listing; see marketplaceService.ts's projectListing().
  tenantId: string;
  branchId: string;
  totalPlots: number;
  availablePlots: number;
  priceFrom: number;
  priceTo: number;
  sqmFrom: number;
  sqmTo: number;
  imageUrl: string;
  amenities: string[];
  titleType: "C of O" | "R of O" | "Governor's Consent" | "Gazette";
  titleVerified: boolean;
  lastVerified: string;
  // Independent of titleType/titleVerified above (which cover the title
  // instrument itself) — these are the two checks EstateDetail.tsx used to
  // fabricate identically for every estate. Optional: an estate with no
  // entry here has genuinely never had that check attempted.
  agisRegistration?: VerificationCheck;
  encroachmentStatus?: VerificationCheck;
  // Real, configured modifier — corner plots are priced as the estate's
  // largest standard tier's price × (1 + this / 100), computed in
  // generatePlots below. Never a separately fabricated figure.
  cornerPremiumPct: number;
  description: string;
  plots: Plot[];
  rows: number;
  cols: number;
  // Public-marketplace-only fields — real developer-declared data, only
  // meaningful once marketplaceService.ts's projectListing() reads them (and
  // only if the owning tenant clears the publication gate there).
  paymentPlans: PaymentPlan[];
  intent: "development" | "investment" | "both";
  publishedDate: string;
  // The estate's own opt-in switch — a developer can pull an estate off the
  // public marketplace (still sellable through /estates to their own
  // customers) without touching their tenant's verification state. One of
  // four conditions projectListing() checks; see marketplaceService.ts.
  published: boolean;
}

export interface Payment {
  id: string;
  date: string;
  amount: number;
  currency: Currency;
  type: "installment" | "outright" | "delta" | "deposit";
  // "pending_verification": the gateway webhook confirmed the charge but a
  // Finance Officer hasn't signed off yet — see the two-step audit in
  // portfolioService.ts's submitInstallmentPayment/verifyInstallmentPayment
  // and marketplaceCheckoutService.ts. Never mark a payment "confirmed"
  // optimistically on the client.
  status: "confirmed" | "pending" | "pending_verification" | "failed" | "rejected";
  receiptId: string;
  rejectionReason?: string;
  verifiedAt?: string;
}

// Explicit alias so the "PaymentRecord" contract named in the portfolio-fixes
// spec has a real exported type, without duplicating Payment's fields —
// they're the same record, just named per its role at the callsite.
export type PaymentRecord = Payment;

// The full owned-plot lifecycle. Replaces the old ad hoc
// "active" | "completed" | "defaulted" union — that collapsed too much into
// "active" (a buyer in arrears rendered identically to one in good standing).
// Any status not explicitly handled by PlotStatusBadge falls back to a
// neutral style, never a positive one.
export type PlotAccountStatus =
  | "reserved" // 45-min checkout lock held, not yet paid
  | "pending_verification" // payment webhook landed, Finance hasn't signed off
  | "allocated" // Finance verified, documents issued, first payment recorded
  | "installment_active" // an ongoing installment/milestone plan, in good standing
  | "completed" // paid in full
  | "in_arrears" // a scheduled payment is overdue past the grace period
  | "upgrade_pending" // an upgrade/swap request is awaiting developer-side approval
  | "transferred"; // ownership moved to a new buyer via resale — see resaleService.ts

export interface ArrearsInfo {
  amountOwed: number;
  overdueSinceDate: string;
  gracePeriodDays: number;
  graceEndsDate: string;
  penaltyAmount?: number;
  penaltyReason?: string;
}

export interface OwnedPlot {
  id: string;
  estateId: string;
  plotId: string;
  plotLabel: string;
  estate: string;
  location: string;
  sqm: number;
  // Nominal tier size vs actual surveyed area (a plot sold as "250 sqm" may
  // survey at 248.6) — actualSqm is display-only, optional because the
  // internal single-tenant mockData.Plot model (unlike the marketplace's
  // ListingPlot) doesn't track this distinction for every legacy record.
  actualSqm?: number;
  isCorner?: boolean;
  cornerPremiumPct?: number;
  // The pre-premium tier/base price — only populated where the purchase flow
  // actually tracked it (the marketplace checkout does; the legacy internal
  // Estate flow's generated plots don't store a clean base/premium split).
  // Corner-premium math is only rendered when this is present, rather than
  // ever fabricating a percentage that isn't real.
  basePrice?: number;
  titleType?: Estate["titleType"];
  titleVerified?: boolean;
  intent: "development" | "investment";
  plan: PaymentPlan;
  totalPrice: number;
  paidAmount: number;
  currency: Currency;
  acquiredDate: string;
  status: PlotAccountStatus;
  nextDueDate?: string;
  nextDueAmount?: number;
  payments: Payment[];
  installmentMonths?: number;
  installmentsPaid?: number;
  // Populated only while status is "in_arrears" — see ArrearsBanner.
  arrears?: ArrearsInfo;
  // Populated once a "Request restructuring" action has been submitted —
  // approval logic lives in the developer portal (not built in this repo yet).
  restructureStatus?: "none" | "pending" | "approved" | "rejected";
}

export interface Document {
  id: string;
  plotId?: string;
  type: "receipt" | "offer_letter" | "allocation_letter" | "deed_of_assignment" | "poa_draft";
  title: string;
  date: string;
  status: "valid" | "void" | "superseded";
  qrCode: string;
  size: string;
  // Append-only chain (see marketplaceCheckoutService.ts / documentsService.ts):
  // every issued document references the transaction that produced it, and
  // any document it supersedes carries the superseded one's id here. Nothing
  // is ever hard-deleted — a new document with `supersedes` set is how a
  // reissue/revocation is represented instead.
  transactionId?: string;
  supersedes?: string;
}

// ─── Plot generation ─────────────────────────────────────────────────────────
//
// A tier's price is set directly by the (fictional) developer, never derived
// from a per-sqm rate — see EstatePriceTier in estatesService.ts. `tiers`
// must be ordered smallest → largest; a corner cell (one of the grid's 4
// extreme cells) is priced off the LARGEST tier's price plus the estate's own
// cornerPremiumPct, matching the convention EstateDetail.tsx's PlotDetailPanel
// already relies on to recover a corner plot's base price exactly.

interface TierSpec {
  sizeSqm: number;
  price: number;
}

function generatePlots(rows: number, cols: number, tiers: TierSpec[], cornerPremiumPct: number, soldRatio = 0.35, reservedRatio = 0.1): Plot[] {
  const plots: Plot[] = [];
  const orientations: Plot["orientation"][] = ["N", "S", "E", "W", "NE", "NW", "SE", "SW"];
  const cornerTier = tiers[tiers.length - 1];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isCorner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
      let sqm: number;
      let price: number;
      if (isCorner) {
        sqm = cornerTier.sizeSqm;
        price = Math.round(cornerTier.price * (1 + cornerPremiumPct / 100));
      } else {
        const tier = tiers[(r * cols + c) % tiers.length];
        sqm = tier.sizeSqm;
        price = tier.price;
      }
      const actualSqm = sqm + Math.round((Math.random() - 0.5) * 6); // surveyed area jitters slightly around the nominal tier

      const rand = Math.random();
      let status: PlotStatus;
      if (rand < soldRatio) status = "sold";
      else if (rand < soldRatio + reservedRatio) status = "reserved";
      else if (rand < soldRatio + reservedRatio + 0.3) status = "available-inv";
      else status = "available-dev";

      plots.push({
        id: `${r}-${c}`,
        row: r,
        col: c,
        sqm,
        actualSqm,
        price,
        orientation: orientations[Math.floor(Math.random() * orientations.length)],
        type: isCorner ? "corner" : "standard",
        status,
        intent: status === "available-inv" ? "investment" : status === "available-dev" ? "development" : undefined,
        projectedROI: status === "available-inv" ? Math.round(18 + Math.random() * 22) : undefined,
        holdingYears: status === "available-inv" ? 3 : undefined,
      });
    }
  }
  return plots;
}

// Deterministically pins a tier's availability so at least one "sold_out" and
// one "low_stock" state is always reachable per estate for testing/demo,
// rather than leaving it to chance whether generatePlots' random ratios
// happen to exhaust a tier. `keepAvailable` of the tier's non-corner plots
// stay available (split development/investment); the rest are marked sold.
function pinTierAvailability(plots: Plot[], sizeSqm: number, keepAvailable: number): void {
  const matches = plots.filter((p) => p.sqm === sizeSqm && p.type !== "corner");
  matches.forEach((p, i) => {
    if (i < keepAvailable) {
      p.status = i % 2 === 0 ? "available-dev" : "available-inv";
      p.intent = i % 2 === 0 ? "development" : "investment";
      p.projectedROI = p.intent === "investment" ? Math.round(18 + Math.random() * 22) : undefined;
      p.holdingYears = p.intent === "investment" ? 3 : undefined;
    } else {
      p.status = "sold";
      p.intent = undefined;
      p.projectedROI = undefined;
      p.holdingYears = undefined;
    }
  });
}

function estateStats(plots: Plot[]): { totalPlots: number; availablePlots: number; priceFrom: number; priceTo: number; sqmFrom: number; sqmTo: number } {
  const availablePlots = plots.filter((p) => p.status === "available-dev" || p.status === "available-inv").length;
  const prices = plots.map((p) => p.price);
  const sqms = plots.map((p) => p.sqm);
  return {
    totalPlots: plots.length,
    availablePlots,
    priceFrom: Math.min(...prices),
    priceTo: Math.max(...prices),
    sqmFrom: Math.min(...sqms),
    sqmTo: Math.max(...sqms),
  };
}

// ─── The 7 canonical estates ─────────────────────────────────────────────────
// Names/geography/sellers/tiers/payment plans/intent kept from the old public
// marketplace fixture (the more developed identity); plot-grid depth (rows,
// cols, per-plot AGIS-eligible layout, corner pricing) from the old internal
// fixture. tenantId/branchId reuse the hierarchy already seeded in
// tenantsService.ts. See landvault-catalogue-unification-plan in project
// memory for the full id-mapping rationale.

const peacelandPlots = generatePlots(
  16, 15,
  [
    { sizeSqm: 250, price: 28_000_000 },
    { sizeSqm: 300, price: 31_500_000 },
    { sizeSqm: 450, price: 44_000_000 },
    { sizeSqm: 600, price: 54_000_000 },
  ],
  15, 0.32, 0.08,
);
pinTierAvailability(peacelandPlots, 450, 2); // low_stock
pinTierAvailability(peacelandPlots, 600, 0); // sold_out

const sunriseGardensPlots = generatePlots(
  12, 15,
  [
    { sizeSqm: 300, price: 30_000_000 },
    { sizeSqm: 500, price: 42_000_000 },
    { sizeSqm: 700, price: 52_500_000 },
  ],
  12, 0.38, 0.12,
);
pinTierAvailability(sunriseGardensPlots, 700, 0); // sold_out

const goldenAcresPlots = generatePlots(
  16, 20,
  [
    { sizeSqm: 180, price: 11_000_000 },
    { sizeSqm: 250, price: 14_000_000 },
    { sizeSqm: 350, price: 18_500_000 },
  ],
  10, 0.28, 0.1,
);
pinTierAvailability(goldenAcresPlots, 250, 3); // low_stock

const riversideEstatePlots = generatePlots(
  14, 16,
  [
    { sizeSqm: 300, price: 26_000_000 },
    { sizeSqm: 450, price: 35_000_000 },
    { sizeSqm: 600, price: 42_000_000 },
  ],
  18, 0.3, 0.1,
);

const emeraldHillsPlots = generatePlots(
  10, 12,
  [
    { sizeSqm: 250, price: 19_000_000 },
    { sizeSqm: 400, price: 27_000_000 },
  ],
  20, 0.3, 0.1,
);

const palmViewPlots = generatePlots(
  12, 14,
  [
    { sizeSqm: 200, price: 13_500_000 },
    { sizeSqm: 300, price: 18_000_000 },
    { sizeSqm: 500, price: 26_500_000 },
  ],
  12, 0.3, 0.1,
);
pinTierAvailability(palmViewPlots, 500, 2); // low_stock

const crownCourtPlots = generatePlots(
  13, 15,
  [
    { sizeSqm: 350, price: 33_000_000 },
    { sizeSqm: 500, price: 42_000_000 },
    { sizeSqm: 700, price: 52_000_000 },
  ],
  15, 0.3, 0.1,
);
pinTierAvailability(crownCourtPlots, 700, 0); // sold_out

export const ESTATES: Estate[] = [
  {
    id: "peaceland",
    name: "Peaceland",
    area: "Lekki",
    city: "Lagos",
    state: "Lagos",
    location: "Lekki, Lagos",
    tenantId: "estintin-group",
    branchId: "double-king",
    ...estateStats(peacelandPlots),
    imageUrl: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&h=600&fit=crop&auto=format",
    amenities: ["Perimeter Fencing", "Motorable Roads", "Solar Street Lighting", "Drainage System", "Gate House"],
    titleType: "C of O",
    titleVerified: true,
    lastVerified: "2026-07-10",
    agisRegistration: { status: "verified", date: "2026-07-10" },
    encroachmentStatus: { status: "verified", date: "2026-07-10", note: "No encroachment notices on file as of this date." },
    cornerPremiumPct: 15,
    description: "A gated residential and investment development in Lekki with serviced roads and 24/7 estate security. Each plot comes with a Certificate of Occupancy.",
    plots: peacelandPlots,
    rows: 16,
    cols: 15,
    paymentPlans: ["outright", "installment", "milestone"],
    intent: "both",
    publishedDate: "2026-07-01",
    published: true,
  },
  {
    id: "sunrise-gardens",
    name: "Sunrise Gardens",
    area: "Maitama Extension",
    city: "Abuja",
    state: "Federal Capital Territory (Abuja)",
    location: "Maitama Extension, Abuja",
    tenantId: "estintin-group",
    branchId: "heritage",
    ...estateStats(sunriseGardensPlots),
    imageUrl: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&h=600&fit=crop&auto=format",
    amenities: ["Recreational Park", "Motorable Roads", "Drainage System", "Gate House", "Solar Street Lighting"],
    titleType: "Governor's Consent",
    titleVerified: true,
    lastVerified: "2026-06-02",
    agisRegistration: { status: "pending", note: "Submitted to AGIS; confirmation still outstanding." },
    encroachmentStatus: { status: "verified", date: "2026-06-02" },
    cornerPremiumPct: 12,
    description: "A premium investment-focused layout in Maitama Extension, fully serviced with government-approved infrastructure.",
    plots: sunriseGardensPlots,
    rows: 12,
    cols: 15,
    paymentPlans: ["outright", "installment"],
    intent: "investment",
    publishedDate: "2026-05-28",
    published: true,
  },
  {
    id: "golden-acres",
    name: "Golden Acres",
    area: "Sagamu Interchange",
    city: "Sagamu",
    state: "Ogun",
    location: "Sagamu Interchange, Sagamu",
    tenantId: "estintin-group",
    branchId: "premium",
    ...estateStats(goldenAcresPlots),
    imageUrl: "https://images.unsplash.com/photo-1590424693420-1d68e1fd46b5?w=800&h=600&fit=crop&auto=format",
    amenities: ["Motorable Roads", "Drainage System", "Perimeter Fencing"],
    titleType: "R of O",
    titleVerified: true,
    lastVerified: "2026-05-20",
    agisRegistration: { status: "verified", date: "2026-05-20" },
    // Genuinely not checked yet — rendered plainly, never as a clean bill of
    // health. See VerificationSection in EstateDetail.tsx.
    encroachmentStatus: { status: "not_checked" },
    cornerPremiumPct: 10,
    description: "An affordable development plot layout close to the Sagamu Interchange, popular with first-time buyers.",
    plots: goldenAcresPlots,
    rows: 16,
    cols: 20,
    paymentPlans: ["outright", "installment", "milestone"],
    intent: "development",
    publishedDate: "2026-05-10",
    published: true,
  },
  {
    id: "riverside-estate",
    name: "Riverside Estate",
    area: "GRA Phase 2",
    city: "Port Harcourt",
    state: "Rivers",
    location: "GRA Phase 2, Port Harcourt",
    tenantId: "estintin-group",
    branchId: "heritage",
    ...estateStats(riversideEstatePlots),
    imageUrl: "https://images.unsplash.com/photo-1524813686514-a57563d77965?w=800&h=600&fit=crop&auto=format",
    amenities: ["Gate House", "Motorable Roads", "Drainage System", "Solar Street Lighting"],
    titleType: "C of O",
    titleVerified: true,
    lastVerified: "2026-04-15",
    agisRegistration: { status: "verified", date: "2026-04-15" },
    encroachmentStatus: { status: "verified", date: "2026-04-15" },
    cornerPremiumPct: 18,
    description: "A well-located estate in GRA Phase 2 with proximity to the city's commercial district.",
    plots: riversideEstatePlots,
    rows: 14,
    cols: 16,
    paymentPlans: ["outright", "installment"],
    intent: "both",
    publishedDate: "2026-04-02",
    published: true,
  },
  {
    id: "emerald-hills",
    name: "Emerald Hills",
    area: "Yaba",
    city: "Lagos",
    state: "Lagos",
    location: "Yaba, Lagos",
    tenantId: "crestview-homes",
    branchId: "crestview-main",
    ...estateStats(emeraldHillsPlots),
    imageUrl: "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=800&h=600&fit=crop&auto=format",
    amenities: ["Perimeter Fencing", "Motorable Roads", "Drainage System"],
    titleType: "Gazette",
    titleVerified: true,
    lastVerified: "2025-12-01",
    agisRegistration: { status: "verified", date: "2025-12-01" },
    encroachmentStatus: { status: "verified", date: "2025-12-01" },
    cornerPremiumPct: 20,
    description: "A compact, well-serviced layout in Yaba suited to buyers building close to the mainland's commercial core.",
    plots: emeraldHillsPlots,
    rows: 10,
    cols: 12,
    paymentPlans: ["outright"],
    intent: "development",
    publishedDate: "2025-11-20",
    published: true,
  },
  {
    id: "palm-view",
    name: "Palm View",
    area: "Ring Road",
    city: "Ibadan",
    state: "Oyo",
    location: "Ring Road, Ibadan",
    tenantId: "estintin-group",
    branchId: "double-king",
    ...estateStats(palmViewPlots),
    imageUrl: "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=800&h=600&fit=crop&auto=format",
    amenities: ["Motorable Roads", "Drainage System", "Gate House"],
    titleType: "C of O",
    titleVerified: true,
    lastVerified: "2026-03-08",
    agisRegistration: { status: "verified", date: "2026-03-08" },
    encroachmentStatus: { status: "verified", date: "2026-03-08" },
    cornerPremiumPct: 12,
    description: "An investment-oriented layout along Ibadan's Ring Road corridor, positioned for medium-term appreciation.",
    plots: palmViewPlots,
    rows: 12,
    cols: 14,
    paymentPlans: ["outright", "installment"],
    intent: "investment",
    publishedDate: "2026-02-25",
    published: true,
  },
  {
    id: "crown-court",
    name: "Crown Court",
    area: "Guzape",
    city: "Abuja",
    state: "Federal Capital Territory (Abuja)",
    location: "Guzape, Abuja",
    tenantId: "estintin-group",
    branchId: "premium",
    ...estateStats(crownCourtPlots),
    imageUrl: "https://images.unsplash.com/photo-1501183638710-841dd1904471?w=800&h=600&fit=crop&auto=format",
    amenities: ["Perimeter Fencing", "Motorable Roads", "Solar Street Lighting", "Recreational Park", "Gate House"],
    titleType: "C of O",
    titleVerified: true,
    lastVerified: "2026-08-01",
    agisRegistration: { status: "verified", date: "2026-08-01" },
    encroachmentStatus: { status: "verified", date: "2026-08-01" },
    cornerPremiumPct: 15,
    description: "A high-end development plot layout in Guzape, close to established diplomatic and residential districts.",
    plots: crownCourtPlots,
    rows: 13,
    cols: 15,
    paymentPlans: ["outright", "installment", "milestone"],
    intent: "development",
    publishedDate: "2026-07-22",
    published: true,
  },
];

export const OWNED_PLOTS: OwnedPlot[] = [
  {
    id: "op-001",
    estateId: "peaceland",
    plotId: "3-4",
    plotLabel: "Block C, Plot 4",
    estate: "Peaceland",
    location: "Lekki, Lagos",
    sqm: 400,
    actualSqm: 398,
    isCorner: true,
    cornerPremiumPct: 15,
    basePrice: 33_391_304,
    titleType: "C of O",
    titleVerified: true,
    intent: "development",
    plan: "installment",
    totalPrice: 38_400_000,
    paidAmount: 19_200_000,
    currency: "NGN",
    acquiredDate: "2024-08-15",
    status: "installment_active",
    nextDueDate: "2026-09-15",
    nextDueAmount: 3_200_000,
    installmentMonths: 12,
    installmentsPaid: 6,
    payments: [
      { id: "p1", date: "2024-08-15", amount: 7_680_000, currency: "NGN", type: "deposit", status: "confirmed", receiptId: "RCP-240815-001" },
      { id: "p2", date: "2024-09-15", amount: 3_200_000, currency: "NGN", type: "installment", status: "confirmed", receiptId: "RCP-240915-001" },
      { id: "p3", date: "2024-10-15", amount: 3_200_000, currency: "NGN", type: "installment", status: "confirmed", receiptId: "RCP-241015-001" },
      { id: "p4", date: "2024-11-15", amount: 3_200_000, currency: "NGN", type: "installment", status: "confirmed", receiptId: "RCP-241115-001" },
      { id: "p5", date: "2025-01-15", amount: 3_200_000, currency: "NGN", type: "installment", status: "confirmed", receiptId: "RCP-250115-001" },
      { id: "p6", date: "2025-02-15", amount: 3_200_000, currency: "NGN", type: "installment", status: "confirmed", receiptId: "RCP-250215-001" },
      { id: "p7", date: "2025-03-15", amount: 3_200_000, currency: "NGN", type: "installment", status: "confirmed", receiptId: "RCP-250315-001" },
    ],
  },
  {
    id: "op-002",
    estateId: "golden-acres",
    plotId: "7-9",
    plotLabel: "Block G, Plot 9",
    estate: "Golden Acres",
    location: "Sagamu Interchange, Sagamu",
    sqm: 300,
    actualSqm: 301,
    isCorner: false,
    titleType: "R of O",
    titleVerified: true,
    intent: "investment",
    plan: "outright",
    totalPrice: 13_200_000,
    paidAmount: 13_200_000,
    currency: "NGN",
    acquiredDate: "2023-05-20",
    status: "completed",
    installmentMonths: 1,
    installmentsPaid: 1,
    payments: [
      { id: "p8", date: "2023-05-20", amount: 13_200_000, currency: "NGN", type: "outright", status: "confirmed", receiptId: "RCP-230520-001" },
    ],
  },
  // Seeded specifically to demonstrate the in_arrears path (ArrearsBanner,
  // restructuring, PlotStatusBadge's non-positive fallback) — otherwise
  // untestable without waiting out a real missed payment.
  {
    id: "op-003",
    estateId: "sunrise-gardens",
    plotId: "5-3",
    plotLabel: "Block B, Plot 3",
    estate: "Sunrise Gardens",
    location: "Maitama Extension, Abuja",
    sqm: 350,
    actualSqm: 347,
    isCorner: false,
    titleType: "Governor's Consent",
    titleVerified: true,
    intent: "development",
    plan: "installment",
    totalPrice: 24_000_000,
    paidAmount: 9_600_000,
    currency: "NGN",
    acquiredDate: "2025-08-20",
    status: "in_arrears",
    nextDueDate: "2026-07-20",
    nextDueAmount: 1_600_000,
    installmentMonths: 12,
    installmentsPaid: 3,
    // Two installments (#4 and #5) have now passed their due date — the
    // schedule (portfolioService.ts's generateSchedule) classifies both as
    // overdue from today's date, so amountOwed covers both, not just the
    // first one that triggered arrears.
    arrears: {
      amountOwed: 3_200_000,
      overdueSinceDate: "2026-07-20",
      gracePeriodDays: 14,
      graceEndsDate: "2026-08-03",
      penaltyAmount: 80_000,
      penaltyReason: "5% late-payment penalty on the first missed installment, applied after the 14-day grace period per the estate's payment terms.",
    },
    restructureStatus: "none",
    payments: [
      { id: "p9", date: "2025-08-20", amount: 4_800_000, currency: "NGN", type: "deposit", status: "confirmed", receiptId: "RCP-250820-001" },
      { id: "p10", date: "2025-09-20", amount: 1_600_000, currency: "NGN", type: "installment", status: "confirmed", receiptId: "RCP-250920-001" },
      { id: "p11", date: "2025-10-20", amount: 1_600_000, currency: "NGN", type: "installment", status: "confirmed", receiptId: "RCP-251020-001" },
      { id: "p12", date: "2025-11-20", amount: 1_600_000, currency: "NGN", type: "installment", status: "confirmed", receiptId: "RCP-251120-001" },
    ],
  },
];

export const DOCUMENTS: Document[] = [
  { id: "doc-001", plotId: "op-001", type: "offer_letter", title: "Offer Letter — Peaceland, Block C Plot 4", date: "2024-08-14", status: "valid", qrCode: "QR-PLD-240814-001", size: "184 KB" },
  { id: "doc-002", plotId: "op-001", type: "allocation_letter", title: "Allocation Letter — Peaceland, Block C Plot 4", date: "2024-08-16", status: "valid", qrCode: "QR-PLD-240816-001", size: "201 KB" },
  { id: "doc-003", plotId: "op-001", type: "receipt", title: "Payment Receipt — Deposit ₦7,680,000", date: "2024-08-15", status: "valid", qrCode: "QR-RCP-240815-001", size: "92 KB" },
  { id: "doc-004", plotId: "op-001", type: "receipt", title: "Payment Receipt — Installment 1 ₦3,200,000", date: "2024-09-15", status: "valid", qrCode: "QR-RCP-240915-001", size: "90 KB" },
  { id: "doc-005", plotId: "op-001", type: "receipt", title: "Payment Receipt — Installment 2 ₦3,200,000", date: "2024-10-15", status: "valid", qrCode: "QR-RCP-241015-001", size: "90 KB" },
  { id: "doc-006", plotId: "op-002", type: "offer_letter", title: "Offer Letter — Golden Acres, Block G Plot 9", date: "2023-05-19", status: "valid", qrCode: "QR-GA-230519-001", size: "178 KB" },
  { id: "doc-007", plotId: "op-002", type: "allocation_letter", title: "Allocation Letter — Golden Acres, Block G Plot 9", date: "2023-05-21", status: "valid", qrCode: "QR-GA-230521-001", size: "196 KB" },
  { id: "doc-008", plotId: "op-002", type: "deed_of_assignment", title: "Deed of Assignment — Golden Acres, Block G Plot 9", date: "2023-07-03", status: "valid", qrCode: "QR-DOA-230703-001", size: "342 KB" },
  { id: "doc-009", plotId: "op-002", type: "receipt", title: "Payment Receipt — Outright ₦13,200,000", date: "2023-05-20", status: "valid", qrCode: "QR-RCP-230520-001", size: "91 KB" },
];

export interface Review {
  id: string;
  estateId: string;
  author: string;
  rating: number; // 1-5
  comment: string;
  date: string;
  likes: number;
}

export const REVIEWS: Review[] = [
  { id: "r1", estateId: "peaceland", author: "T. Adeyemi", rating: 5, comment: "Smooth allocation process and the C of O came through exactly on schedule. Very happy with Peaceland.", date: "2026-06-02", likes: 14 },
  { id: "r2", estateId: "peaceland", author: "F. Okafor", rating: 4, comment: "Great estate, roads still being finished on the east side but overall a solid investment.", date: "2026-05-18", likes: 6 },
  { id: "r3", estateId: "sunrise-gardens", author: "K. Ibrahim", rating: 4, comment: "Good value for the location. Verification took a bit longer than expected.", date: "2026-04-30", likes: 3 },
  { id: "r4", estateId: "sunrise-gardens", author: "A. Musa", rating: 5, comment: "Sold my plot on the secondary market in under two weeks. Trusted process throughout.", date: "2026-03-12", likes: 9 },
  { id: "r5", estateId: "golden-acres", author: "O. Nwosu", rating: 3, comment: "Affordable and title is clean, but amenities are still catching up to the marketing.", date: "2026-02-25", likes: 2 },
  { id: "r6", estateId: "golden-acres", author: "E. Obi", rating: 5, comment: "First-time buyer here — the installment plan made this genuinely accessible. No regrets.", date: "2026-01-30", likes: 11 },
];

export const FX_RATES: Record<Currency, number> = {
  NGN: 1,
  USD: 1 / 1650,
  GBP: 1 / 2100,
  EUR: 1 / 1800,
};

export function formatCurrency(amount: number, currency: Currency = "NGN"): string {
  const converted = amount * FX_RATES[currency];
  const symbols: Record<Currency, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };
  if (currency === "NGN") {
    return `₦${(converted / 1_000_000).toFixed(1)}M`;
  }
  return `${symbols[currency]}${converted.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// ─── Block layout (for rendering the estate as blocks divided by streets) ──

export const BLOCK_ROWS = 4;
export const BLOCK_COLS = 4;

export function getPlotBlockLabel(estate: Estate, plot: Plot): { block: string; plotNumber: number; label: string } {
  const numBlockCols = Math.ceil(estate.cols / BLOCK_COLS);
  const blockRow = Math.floor(plot.row / BLOCK_ROWS);
  const blockCol = Math.floor(plot.col / BLOCK_COLS);
  const blockIndex = blockRow * numBlockCols + blockCol;
  const block = blockIndex < 26
    ? String.fromCharCode(65 + blockIndex)
    : String.fromCharCode(65 + Math.floor(blockIndex / 26) - 1) + String.fromCharCode(65 + (blockIndex % 26));
  const withinRow = plot.row % BLOCK_ROWS;
  const withinCol = plot.col % BLOCK_COLS;
  const plotNumber = withinRow * BLOCK_COLS + withinCol + 1;
  return { block, plotNumber, label: `Block ${block}, Plot ${plotNumber}` };
}

export function formatAmount(amount: number, currency: Currency = "NGN"): string {
  const converted = amount * FX_RATES[currency];
  const symbols: Record<Currency, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };
  return `${symbols[currency]}${converted.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
