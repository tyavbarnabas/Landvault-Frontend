// A phone number as the backend stores it: one international number
// (+447700900123), built from the chosen dial code and what was typed. The
// sign-up form uses these; the backend makes the final check.

import { dialCountry, type DialCountry } from "../data/dialCodes";

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

// How it reads back: "+44 7700 900123" — the code, then the digits in
// groups of three or four, for the hint under the field.
export function displayInternational(iso: string, typed: string): string {
  const country = dialCountry(iso);
  if (!country) return typed.trim();
  const digits = nationalDigits(country, typed);
  const groups = digits.length <= 6 ? [digits] : [digits.slice(0, digits.length - 6), digits.slice(-6, -3), digits.slice(-3)];
  return `${country.dial} ${groups.filter(Boolean).join(" ")}`;
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
