// One password rule for every screen that sets one — sign-up, invitation,
// reset, change. A strong rule on sign-up alone would be pointless if a reset
// accepted "1".
//
// The backend has NO password rule yet (RegisterRequest is @NotBlank only), so
// today this is the only check — see INTEGRATION_TESTING.md. When the backend
// adds one, its refusal is shown as-is and these rules should match it.
//
// Required: what actually stops guessing — length, not a famous password, not
// the user's own name or email. Letters + a number is required too: cheap for
// the user, and it rules out the all-digit "passwords" (dates, phone numbers)
// common here. Beyond that the meter ENCOURAGES (12+ characters, a symbol)
// without forcing, since length beats forced symbols.

export const MIN_PASSWORD_LENGTH = 8;
// BCrypt (the backend's hasher) can't take more than 72 BYTES; recent Spring
// versions refuse longer rather than silently truncating. 64 characters stays
// under that for ordinary text; the backend checks the real byte limit.
export const MAX_PASSWORD_LENGTH = 64;

// The most-used passwords, plus local favourites. Lowercased; compared after
// stripping trailing digits/symbols, so "password123!" is caught too.
const COMMON = new Set([
  "password", "passw0rd", "qwerty", "qwertyuiop", "abc", "abcdef", "letmein", "welcome", "admin", "iloveyou",
  "monkey", "dragon", "football", "baseball", "sunshine", "princess", "master", "shadow", "trustno",
  "changeme", "default", "secret", "login", "starwars", "whatever", "landvault", "nigeria", "naija",
  "lagos", "abuja", "jesus", "godisgood", "blessed", "chelsea", "arsenal", "manutd",
]);

export interface PasswordCheck {
  id: "length" | "letterAndNumber" | "notCommon" | "notPersonal";
  label: string;
  met: boolean;
}

export type PasswordStrength = "weak" | "fair" | "strong";

export interface PasswordAssessment {
  checks: PasswordCheck[];
  // Every required check met.
  acceptable: boolean;
  strength: PasswordStrength;
  // The first unmet requirement, as a sentence for a form error.
  problem: string | null;
}

export function assessPassword(password: string, personal: { email?: string; firstName?: string; lastName?: string } = {}): PasswordAssessment {
  const lower = password.toLowerCase();
  const core = lower.replace(/[^a-z]+$/g, "").replace(/^[^a-z]+/g, "");
  const personalBits = [personal.email?.split("@")[0], personal.firstName, personal.lastName]
    .map((s) => (s ?? "").trim().toLowerCase())
    .filter((s) => s.length >= 3);

  const checks: PasswordCheck[] = [
    { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, met: password.length >= MIN_PASSWORD_LENGTH },
    { id: "letterAndNumber", label: "Letters and at least one number", met: /[a-zA-Z]/.test(password) && /\d/.test(password) },
    { id: "notCommon", label: "Not a common password", met: password.length > 0 && !COMMON.has(core) && !COMMON.has(lower) && !/^(.)\1+$/.test(password) && !/^(0123|1234|abcd)/.test(lower) },
    { id: "notPersonal", label: "Doesn't contain your name or email", met: password.length > 0 && !personalBits.some((bit) => lower.includes(bit)) },
  ];
  const acceptable = checks.every((c) => c.met);

  const extras = Number(password.length >= 12) + Number(/[^a-zA-Z0-9]/.test(password)) + Number(/[a-z]/.test(password) && /[A-Z]/.test(password));
  const strength: PasswordStrength = !acceptable ? "weak" : extras >= 2 ? "strong" : "fair";

  const firstUnmet = checks.find((c) => !c.met);
  const problem = !firstUnmet ? null
    : firstUnmet.id === "length" ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    : firstUnmet.id === "letterAndNumber" ? "Use letters and at least one number."
    : firstUnmet.id === "notCommon" ? "That password is too common — it's among the first ones attackers try."
    : "Don't use your name or email in your password.";

  return { checks, acceptable, strength, problem };
}
