// Shared minimal-but-valid fixture builders for the money/eligibility unit
// tests (see PART 5 of the backend-integration-readiness pass). Each factory
// returns a fully-typed, sensible default object; tests override only the
// field(s) the case under test actually cares about, so a test reads as "this
// one field differs" rather than a wall of unrelated setup.
import type { Currency, Estate, OwnedPlot } from "../data/mockData";
import type { PriceTier } from "../services/estatesService";
import type { ListingPlot } from "../services/marketplacePlotsService";

export function makeOwnedPlot(overrides: Partial<OwnedPlot> = {}): OwnedPlot {
  return {
    id: "op-1",
    estateId: "e-1",
    plotId: "p-1",
    plotLabel: "Block A, Plot 1",
    estate: "Test Estate",
    location: "Lekki, Lagos",
    sqm: 500,
    intent: "investment",
    plan: "installment",
    totalPrice: 10_000_000,
    paidAmount: 4_000_000,
    currency: "NGN" as Currency,
    acquiredDate: "2025-01-01",
    status: "installment_active",
    payments: [],
    ...overrides,
  };
}

export function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "e-1",
    name: "Test Estate",
    area: "Lekki",
    city: "Lagos",
    state: "Lagos" as Estate["state"],
    location: "Lekki, Lagos",
    tenantId: "t-1",
    branchId: "b-1",
    totalPlots: 100,
    availablePlots: 50,
    priceFrom: 5_000_000,
    priceTo: 15_000_000,
    sqmFrom: 300,
    sqmTo: 600,
    imageUrl: "",
    amenities: [],
    titleType: "C of O",
    titleVerified: true,
    lastVerified: "2025-01-01",
    cornerPremiumPct: 10,
    description: "",
    plots: [],
    rows: 10,
    cols: 10,
    paymentPlans: ["outright", "installment"],
    intent: "both",
    publishedDate: "2025-01-01",
    published: true,
    footprint: [
      { lat: 6.4, lng: 3.4 },
      { lat: 6.4, lng: 3.41 },
      { lat: 6.41, lng: 3.41 },
      { lat: 6.41, lng: 3.4 },
    ],
    ...overrides,
  };
}

export function makePriceTier(overrides: Partial<PriceTier> = {}): PriceTier {
  return {
    id: "e-1-500",
    sizeSqm: 500,
    actualAreaSqm: 498,
    price: 10_000_000,
    availability: "available",
    plotsRemaining: 20,
    ...overrides,
  };
}

export function makeListingPlot(overrides: Partial<ListingPlot> = {}): ListingPlot {
  return {
    id: "p-1",
    listingId: "e-1",
    tierId: "e-1-500",
    sizeSqm: 500,
    block: "A",
    plotNumber: 1,
    row: 0,
    col: 0,
    isCorner: false,
    actualAreaSqm: 498,
    orientation: "north",
    status: "available-inv",
    ...overrides,
  };
}
