export type PlotStatus = "available-dev" | "available-inv" | "reserved" | "sold";
export type PaymentPlan = "outright" | "milestone" | "installment";
export type Currency = "NGN" | "USD" | "GBP" | "EUR";
export type KYCStatus = "unsubmitted" | "submitted" | "under_review" | "approved" | "rejected";

export interface Plot {
  id: string;
  row: number;
  col: number;
  sqm: number;
  price: number; // NGN
  orientation: "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW";
  type: "standard" | "corner";
  status: PlotStatus;
  intent?: "development" | "investment";
  projectedROI?: number;
  holdingYears?: number;
}

export interface Estate {
  id: string;
  name: string;
  location: string;
  state: string;
  totalPlots: number;
  availablePlots: number;
  priceFrom: number;
  priceTo: number;
  sqmFrom: number;
  sqmTo: number;
  imageId: string;
  amenities: string[];
  titleType: "C of O" | "R of O" | "Governor's Consent" | "Gazette";
  titleVerified: boolean;
  lastVerified: string;
  description: string;
  plots: Plot[];
  rows: number;
  cols: number;
}

export interface Payment {
  id: string;
  date: string;
  amount: number;
  currency: Currency;
  type: "installment" | "outright" | "delta" | "deposit";
  status: "confirmed" | "pending" | "failed";
  receiptId: string;
}

export interface OwnedPlot {
  id: string;
  estateId: string;
  plotId: string;
  plotLabel: string;
  estate: string;
  location: string;
  sqm: number;
  intent: "development" | "investment";
  plan: PaymentPlan;
  totalPrice: number;
  paidAmount: number;
  currency: Currency;
  acquiredDate: string;
  status: "active" | "completed" | "defaulted";
  nextDueDate?: string;
  nextDueAmount?: number;
  payments: Payment[];
  installmentMonths?: number;
  installmentsPaid?: number;
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
}

function generatePlots(rows: number, cols: number, basePrice: number, soldRatio = 0.35, reservedRatio = 0.1): Plot[] {
  const plots: Plot[] = [];
  const orientations: Plot["orientation"][] = ["N", "S", "E", "W", "NE", "NW", "SE", "SW"];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rand = Math.random();
      const isCorner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
      const isEdge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      const sqm = isCorner ? 500 : isEdge ? 400 : 300;
      const price = basePrice * (isCorner ? 1.4 : isEdge ? 1.2 : 1);

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

export const ESTATES: Estate[] = [
  {
    id: "millbrook",
    name: "Millbrook Gardens",
    location: "Maitama Extension, Abuja",
    state: "FCT",
    totalPlots: 240,
    availablePlots: 142,
    priceFrom: 28_000_000,
    priceTo: 72_000_000,
    sqmFrom: 300,
    sqmTo: 600,
    imageId: "photo-1486325212027-8081e485255e",
    amenities: ["Perimeter Fencing", "Motorable Roads", "Solar Street Lighting", "Drainage System", "Gate House", "Recreational Park"],
    titleType: "C of O",
    titleVerified: true,
    lastVerified: "2025-11-14",
    description: "A premium residential and investment estate in the heart of Maitama Extension. Fully serviced with government-approved infrastructure, each plot comes with a Certificate of Occupancy.",
    plots: generatePlots(16, 15, 32_000_000, 0.32, 0.08),
    rows: 16,
    cols: 15,
  },
  {
    id: "sterling",
    name: "Sterling Court",
    location: "Apo Legislative Quarters Extension",
    state: "FCT",
    totalPlots: 180,
    availablePlots: 95,
    priceFrom: 18_500_000,
    priceTo: 46_000_000,
    sqmFrom: 300,
    sqmTo: 500,
    imageId: "photo-1590424693420-1d68e1fd46b5",
    amenities: ["Perimeter Fence", "Paved Internal Roads", "Electricity Connection", "Water Supply", "CCTV at Entry", "Landscaped Common Areas"],
    titleType: "Governor's Consent",
    titleVerified: true,
    lastVerified: "2025-09-02",
    description: "Strategically located adjacent to the Apo Legislative Quarters, Sterling Court offers affordable residential plots with all requisite approvals.",
    plots: generatePlots(12, 15, 20_000_000, 0.38, 0.12),
    rows: 12,
    cols: 15,
  },
  {
    id: "emerald",
    name: "Emerald Park",
    location: "Lugbe District, Abuja",
    state: "FCT",
    totalPlots: 320,
    availablePlots: 201,
    priceFrom: 9_500_000,
    priceTo: 22_000_000,
    sqmFrom: 300,
    sqmTo: 450,
    imageId: "photo-1500382017468-9049fed747ef",
    amenities: ["Perimeter Fence", "Estate Roads", "Borehole Water", "Gate", "Landscaping"],
    titleType: "R of O",
    titleVerified: true,
    lastVerified: "2026-01-10",
    description: "An affordable residential estate in Lugbe District, ideal for first-time buyers and long-term investors. Flexible installment plans available.",
    plots: generatePlots(16, 20, 11_000_000, 0.28, 0.1),
    rows: 16,
    cols: 20,
  },
];

export const OWNED_PLOTS: OwnedPlot[] = [
  {
    id: "op-001",
    estateId: "millbrook",
    plotId: "3-4",
    plotLabel: "Block C, Plot 4",
    estate: "Millbrook Gardens",
    location: "Maitama Extension, Abuja",
    sqm: 400,
    intent: "development",
    plan: "installment",
    totalPrice: 38_400_000,
    paidAmount: 19_200_000,
    currency: "NGN",
    acquiredDate: "2024-08-15",
    status: "active",
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
    estateId: "emerald",
    plotId: "7-9",
    plotLabel: "Block G, Plot 9",
    estate: "Emerald Park",
    location: "Lugbe District, Abuja",
    sqm: 300,
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
];

export const DOCUMENTS: Document[] = [
  { id: "doc-001", plotId: "op-001", type: "offer_letter", title: "Offer Letter — Millbrook Gardens, Block C Plot 4", date: "2024-08-14", status: "valid", qrCode: "QR-MBG-240814-001", size: "184 KB" },
  { id: "doc-002", plotId: "op-001", type: "allocation_letter", title: "Allocation Letter — Millbrook Gardens, Block C Plot 4", date: "2024-08-16", status: "valid", qrCode: "QR-MBG-240816-001", size: "201 KB" },
  { id: "doc-003", plotId: "op-001", type: "receipt", title: "Payment Receipt — Deposit ₦7,680,000", date: "2024-08-15", status: "valid", qrCode: "QR-RCP-240815-001", size: "92 KB" },
  { id: "doc-004", plotId: "op-001", type: "receipt", title: "Payment Receipt — Installment 1 ₦3,200,000", date: "2024-09-15", status: "valid", qrCode: "QR-RCP-240915-001", size: "90 KB" },
  { id: "doc-005", plotId: "op-001", type: "receipt", title: "Payment Receipt — Installment 2 ₦3,200,000", date: "2024-10-15", status: "valid", qrCode: "QR-RCP-241015-001", size: "90 KB" },
  { id: "doc-006", plotId: "op-002", type: "offer_letter", title: "Offer Letter — Emerald Park, Block G Plot 9", date: "2023-05-19", status: "valid", qrCode: "QR-EP-230519-001", size: "178 KB" },
  { id: "doc-007", plotId: "op-002", type: "allocation_letter", title: "Allocation Letter — Emerald Park, Block G Plot 9", date: "2023-05-21", status: "valid", qrCode: "QR-EP-230521-001", size: "196 KB" },
  { id: "doc-008", plotId: "op-002", type: "deed_of_assignment", title: "Deed of Assignment — Emerald Park, Block G Plot 9", date: "2023-07-03", status: "valid", qrCode: "QR-DOA-230703-001", size: "342 KB" },
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
  { id: "r1", estateId: "millbrook", author: "T. Adeyemi", rating: 5, comment: "Smooth allocation process and the C of O came through exactly on schedule. Very happy with Millbrook.", date: "2026-06-02", likes: 14 },
  { id: "r2", estateId: "millbrook", author: "F. Okafor", rating: 4, comment: "Great estate, roads still being finished on the east side but overall a solid investment.", date: "2026-05-18", likes: 6 },
  { id: "r3", estateId: "sterling", author: "K. Ibrahim", rating: 4, comment: "Good value for the location. Verification took a bit longer than expected.", date: "2026-04-30", likes: 3 },
  { id: "r4", estateId: "sterling", author: "A. Musa", rating: 5, comment: "Sold my plot on the secondary market in under two weeks. Trusted process throughout.", date: "2026-03-12", likes: 9 },
  { id: "r5", estateId: "emerald", author: "O. Nwosu", rating: 3, comment: "Affordable and title is clean, but amenities are still catching up to the marketing.", date: "2026-02-25", likes: 2 },
  { id: "r6", estateId: "emerald", author: "E. Obi", rating: 5, comment: "First-time buyer here — the installment plan made this genuinely accessible. No regrets.", date: "2026-01-30", likes: 11 },
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
