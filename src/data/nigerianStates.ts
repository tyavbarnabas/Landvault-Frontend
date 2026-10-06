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

// ISO 3166-2 codes, transcribed from the backend's nigerian_states dataset
// (src/main/resources/db/data/nigerian-states.sql) — what the boundary-in-state
// check keys on. Names match NIGERIAN_STATES exactly.
export const STATE_ISO_CODES: Record<NigerianState, string> = {
  "Abia": "NG-AB", "Adamawa": "NG-AD", "Akwa Ibom": "NG-AK", "Anambra": "NG-AN", "Bauchi": "NG-BA",
  "Bayelsa": "NG-BY", "Benue": "NG-BE", "Borno": "NG-BO", "Cross River": "NG-CR", "Delta": "NG-DE",
  "Ebonyi": "NG-EB", "Edo": "NG-ED", "Ekiti": "NG-EK", "Enugu": "NG-EN", "Gombe": "NG-GO",
  "Imo": "NG-IM", "Jigawa": "NG-JI", "Kaduna": "NG-KD", "Kano": "NG-KN", "Katsina": "NG-KT",
  "Kebbi": "NG-KE", "Kogi": "NG-KO", "Kwara": "NG-KW", "Lagos": "NG-LA", "Nasarawa": "NG-NA",
  "Niger": "NG-NI", "Ogun": "NG-OG", "Ondo": "NG-ON", "Osun": "NG-OS", "Oyo": "NG-OY",
  "Plateau": "NG-PL", "Rivers": "NG-RI", "Sokoto": "NG-SO", "Taraba": "NG-TA", "Yobe": "NG-YO",
  "Zamfara": "NG-ZA", "Federal Capital Territory (Abuja)": "NG-FC",
};
