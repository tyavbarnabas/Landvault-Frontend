// The 36 states + the Federal Capital Territory. Used for registered/operating
// addresses and "states of operation" in the tenant onboarding wizard.
// LAGOS is exported separately since it drives the LASRERA conditional field
// in Step 5 (Regulatory & compliance).

export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
  "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe",
  "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara",
  "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau",
  "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
  "Federal Capital Territory (Abuja)",
] as const;

export type NigerianState = (typeof NIGERIAN_STATES)[number];

export const LAGOS: NigerianState = "Lagos";
