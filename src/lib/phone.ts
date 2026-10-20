// A phone number as the backend stores it: one international number
// (+447700900123), built from the chosen dial code and what was typed. The
// sign-up form uses these; the backend makes the final check.

import { COMMON_DIAL_ISOS, DIAL_COUNTRIES, dialCountry, type DialCountry } from "../data/dialCodes";

const DEFAULT_LENGTHS: [number, number] = [6, 12];

// The digits after the code: spaces, dashes and brackets go, and a leading
// 0 (the domestic trunk prefix) is dropped where the country uses one. A
// number pasted with its own +code or 00code keeps only what follows it.
export function nationalDigits(country: DialCountry, typed: string): string {
  let digits = typed.replace(/\D/g, "");
  const code = country.dial.slice(1);
  if (/^\s*(\+|00)/.test(typed)) {
    digits = digits.replace(/^00/, "");
    if (digits.startsWith(code)) digits = digits.slice(code.length);
  }
  if (!country.keepsLeadingZero) digits = digits.replace(/^0/, "");
  return digits;
}

export function toInternational(iso: string, typed: string): string {
  const country = dialCountry(iso);
  if (!country) return typed.trim();
  return `${country.dial}${nationalDigits(country, typed)}`;
}

// How it reads back: "+234 805 444 3322" — the code, then the digits in
// threes with the last four together, for the hint under the field.
export function displayInternational(iso: string, typed: string): string {
  const country = dialCountry(iso);
  if (!country) return typed.trim();
  const digits = nationalDigits(country, typed);
  if (digits.length <= 4) return `${country.dial} ${digits}`.trim();
  const head = digits.slice(0, -4).match(/.{1,3}/g) ?? [];
  return `${country.dial} ${[...head, digits.slice(-4)].join(" ")}`;
}

// Why the number can't be right, or null when it could be.
export function phoneProblem(iso: string, typed: string): string | null {
  const country = dialCountry(iso);
  if (!country) return "Choose your country's dialling code.";
  if (/[a-z]/i.test(typed)) return "Use digits only.";
  const digits = nationalDigits(country, typed);
  const [min, max] = country.lengths ?? DEFAULT_LENGTHS;
  if (digits.length < min) return `That looks too short for a ${country.name} number. Check it and try again.`;
  if (digits.length > max) return `That looks too long for a ${country.name} number. Check it and try again.`;
  return null;
}

// Which country a stored number belongs to: the longest dial code it starts
// with, preferring the common countries where codes are shared (+1 → US). A
// number with no plus is taken as Nigerian, as typed.
const rank = (iso: string) => { const i = COMMON_DIAL_ISOS.indexOf(iso); return i < 0 ? COMMON_DIAL_ISOS.length : i; };

export function splitInternational(value: string): { iso: string; number: string } {
  const v = value.trim();
  if (!v.startsWith("+")) return { iso: "NG", number: v };
  const digits = v.replace(/[^\d+]/g, "");
  const country = DIAL_COUNTRIES.filter((c) => digits.startsWith(c.dial))
    .sort((a, b) => b.dial.length - a.dial.length || rank(a.iso) - rank(b.iso))[0];
  return country ? { iso: country.iso, number: digits.slice(country.dial.length) } : { iso: "NG", number: v };
}

// Why a stored international number can't be right, or null when it could be:
// the backend's E.164 shape, and a sensible length for its country.
export function internationalPhoneProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter a phone number.";
  if (!/^\+[1-9]\d{7,14}$/.test(v)) return "Enter the number with its country code — choose the code, then type the number.";
  const { iso, number } = splitInternational(v);
  return phoneProblem(iso, number);
}
