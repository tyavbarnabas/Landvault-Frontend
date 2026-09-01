// A curated list of major Nigerian settlement banks for the onboarding
// wizard's Step 7 (Financial & settlement) bank-name select — same
// hand-curated-list idiom as data/mockData.ts's ESTATES, not an exhaustive
// live CBN registry.

export const NIGERIAN_BANKS = [
  "Access Bank",
  "Zenith Bank",
  "Guaranty Trust Bank (GTBank)",
  "First Bank of Nigeria",
  "United Bank for Africa (UBA)",
  "Fidelity Bank",
  "Union Bank of Nigeria",
  "Sterling Bank",
  "Stanbic IBTC Bank",
  "Ecobank Nigeria",
  "First City Monument Bank (FCMB)",
  "Wema Bank",
  "Polaris Bank",
  "Keystone Bank",
  "Unity Bank",
  "Providus Bank",
  "Titan Trust Bank",
  "Globus Bank",
  "Jaiz Bank",
  "Heritage Bank",
  "Moniepoint MFB",
  "Kuda Bank",
] as const;

export type NigerianBank = (typeof NIGERIAN_BANKS)[number];
