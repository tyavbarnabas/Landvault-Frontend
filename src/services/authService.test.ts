import { describe, it, expect, beforeEach } from "vitest";
import {
  AUTH_ERROR_CODES, MOCK_DEMO_CODES, confirmTwoFactor, disableTwoFactor, errorCodeOf,
  forgotPassword, isBuyer, isPlatformStaff, isPortalStaff, landingRouteFor, login,
  regenerateRecoveryCodes, resetPassword, setupTwoFactor, verifyTwoFactor,
  type AuthUser,
} from "./authService";

const BUYER = "emeka.okonkwo@gmail.com";        // 2FA off
const PORTAL_DIRECTOR = "director@estintin.com"; // 2FA on
const ADMIN = "admin@landvault.com";             // platform staff, must set up 2FA

describe("login without 2FA", () => {
  it("authenticates in one step — no second step appears where there was none", async () => {
    const outcome = await login(BUYER, "password");

    expect(outcome.kind).toBe("authenticated");
    if (outcome.kind === "authenticated") expect(outcome.user.twoFAEnabled).toBe(false);
  });
});

describe("login with 2FA", () => {
  it("returns a challenge instead of tokens, sharing no field with a session", async () => {
    const outcome = await login(PORTAL_DIRECTOR, "password");

    expect(outcome.kind).toBe("two_factor_required");
    if (outcome.kind !== "two_factor_required") return;
    expect(outcome.challenge.twoFactorRequired).toBe(true);
    expect(outcome.challenge.challengeToken).toBeTruthy();
    expect(outcome.challenge.expiresAt).toBeTruthy();
    // No user and no tokens are handed out before the code verifies.
    expect("user" in outcome.challenge).toBe(false);
    expect("token" in outcome.challenge).toBe(false);
    expect("refreshToken" in outcome.challenge).toBe(false);
  });

  it("exchanges challenge + TOTP code for a real session", async () => {
    const outcome = await login(PORTAL_DIRECTOR, "password");
    if (outcome.kind !== "two_factor_required") throw new Error("expected a challenge");

    const user = await verifyTwoFactor(outcome.challenge.challengeToken, MOCK_DEMO_CODES.totp);
    expect(user.email).toBe(PORTAL_DIRECTOR);
  });

  it("accepts a recovery code at the same step, once only", async () => {
    const first = await login(PORTAL_DIRECTOR, "password");
    if (first.kind !== "two_factor_required") throw new Error("expected a challenge");

    // Fresh codes, so the set is known and unused.
    await setupTwoFactor();
    const codes = await confirmTwoFactor(MOCK_DEMO_CODES.totp);
    const recoveryCode = codes[0];

    const user = await verifyTwoFactor(first.challenge.challengeToken, recoveryCode);
    expect(user.email).toBe(PORTAL_DIRECTOR);

    // The same code cannot be reused on a later sign-in.
    const second = await login(PORTAL_DIRECTOR, "password");
    if (second.kind !== "two_factor_required") throw new Error("expected a challenge");
    await expect(verifyTwoFactor(second.challenge.challengeToken, recoveryCode)).rejects.toMatchObject({
      body: { code: "INVALID_TWO_FACTOR_CODE" },
    });
  });

  it("rejects a wrong code with the backend's own code, then locks out", async () => {
    const outcome = await login(PORTAL_DIRECTOR, "password");
    if (outcome.kind !== "two_factor_required") throw new Error("expected a challenge");
    const { challengeToken } = outcome.challenge;

    await expect(verifyTwoFactor(challengeToken, "000000")).rejects.toMatchObject({
      body: { code: "INVALID_TWO_FACTOR_CODE" },
    });

    // The backend throttles and locks out; the UI needs to know which it is.
    for (let i = 0; i < 4; i++) {
      await verifyTwoFactor(challengeToken, "000000").catch(() => {});
    }
    await expect(verifyTwoFactor(challengeToken, MOCK_DEMO_CODES.totp)).rejects.toMatchObject({
      body: { code: "TWO_FACTOR_LOCKED_OUT" },
    });
  });

  it("reports an unknown challenge distinctly, so the UI can restart the sign-in", async () => {
    await expect(verifyTwoFactor("chal_nope", MOCK_DEMO_CODES.totp)).rejects.toMatchObject({
      body: { code: "INVALID_TWO_FACTOR_CHALLENGE" },
    });
  });
});

describe("two-factor enrolment", () => {
  it("setup returns enrolment material and does NOT enable anything", async () => {
    const enrolment = await setupTwoFactor();

    expect(enrolment.secret).toMatch(/^[A-Z2-7]+$/); // base32
    expect(enrolment.otpAuthUri).toContain("otpauth://totp/");
    expect(enrolment.otpAuthUri).toContain(enrolment.secret);
    // Nothing about the account has changed yet — only confirm switches it on.
  });

  it("confirm refuses without a started setup, distinctly from a bad code", async () => {
    await setupTwoFactor();
    await confirmTwoFactor(MOCK_DEMO_CODES.totp); // consumes the pending secret

    await expect(confirmTwoFactor(MOCK_DEMO_CODES.totp)).rejects.toMatchObject({
      body: { code: "TWO_FACTOR_SETUP_REQUIRED" },
    });
  });

  it("confirm rejects a wrong code, so a failed pairing cannot enable 2FA", async () => {
    await setupTwoFactor();
    await expect(confirmTwoFactor("000000")).rejects.toMatchObject({
      body: { code: "INVALID_TWO_FACTOR_CODE" },
    });
  });

  it("confirm returns recovery codes — the only time they exist in plaintext", async () => {
    await setupTwoFactor();
    const codes = await confirmTwoFactor(MOCK_DEMO_CODES.totp);

    expect(codes.length).toBeGreaterThan(4);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("two-factor management", () => {
  it("disabling requires a code — a session alone is not enough", async () => {
    await expect(disableTwoFactor("000000")).rejects.toMatchObject({
      body: { code: "INVALID_TWO_FACTOR_CODE" },
    });
    await expect(disableTwoFactor(MOCK_DEMO_CODES.totp)).resolves.toBeUndefined();
  });

  it("regenerating requires a current code and replaces the previous set", async () => {
    await setupTwoFactor();
    const original = await confirmTwoFactor(MOCK_DEMO_CODES.totp);

    await expect(regenerateRecoveryCodes("000000")).rejects.toMatchObject({
      body: { code: "INVALID_TWO_FACTOR_CODE" },
    });

    const replacement = await regenerateRecoveryCodes(MOCK_DEMO_CODES.totp);
    expect(replacement).not.toEqual(original);
  });
});

describe("password reset", () => {
  it("completes end to end with the emailed code", async () => {
    await forgotPassword(BUYER);
    await expect(resetPassword({ email: BUYER, code: MOCK_DEMO_CODES.reset, newPassword: "a new password" })).resolves.toBeUndefined();
  });

  it("gives ONE generic error for a wrong code, an expired code and a code never requested", async () => {
    // Never requested.
    const never = await resetPassword({ email: "stranger@example.com", code: "111111", newPassword: "x" }).catch((e) => e);
    // Requested, but wrong code.
    await forgotPassword(BUYER);
    const wrong = await resetPassword({ email: BUYER, code: "111111", newPassword: "x" }).catch((e) => e);

    // Identical code and message, so nothing reveals which emails have
    // accounts — the whole point of the backend's equal-timing work.
    expect(errorCodeOf(never)).toBe("INVALID_OR_EXPIRED_CODE");
    expect(errorCodeOf(wrong)).toBe("INVALID_OR_EXPIRED_CODE");
    expect((never as Error).message).toBe((wrong as Error).message);
  });

  it("consumes the code, so it cannot be replayed", async () => {
    await forgotPassword(BUYER);
    await resetPassword({ email: BUYER, code: MOCK_DEMO_CODES.reset, newPassword: "first" });

    await expect(resetPassword({ email: BUYER, code: MOCK_DEMO_CODES.reset, newPassword: "second" }))
      .rejects.toMatchObject({ body: { code: "INVALID_OR_EXPIRED_CODE" } });
  });
});

describe("routing on account state", () => {
  it("routes platform staff to the admin console, portal staff to the portal, buyers to the dashboard", async () => {
    const buyer = await login(BUYER, "password");
    if (buyer.kind !== "authenticated") throw new Error("expected a session");

    expect(landingRouteFor(buyer.user)).toBe("/dashboard");
    expect(isBuyer(buyer.user)).toBe(true);
    expect(isPortalStaff(buyer.user)).toBe(false);
  });

  it("carries mustChangePassword and mustSetUpTwoFa so they can be routed on, never blocked on", async () => {
    const outcome = await login(ADMIN, "password");
    if (outcome.kind !== "authenticated") throw new Error("expected a session");

    // Login SUCCEEDS despite both flags — blocking would strand a
    // bootstrapped Super Admin, who can't fix either without signing in.
    expect(outcome.user.mustChangePassword).toBe(true);
    expect(outcome.user.mustSetUpTwoFa).toBe(true);
    expect(isPlatformStaff(outcome.user)).toBe(true);
  });
});

describe("errorCodeOf", () => {
  it("reads the backend's stable code and ignores anything else", () => {
    expect(errorCodeOf({ body: { code: "TWO_FACTOR_MANDATORY" } })).toBe("TWO_FACTOR_MANDATORY");
    expect(errorCodeOf({ body: { code: "SOMETHING_ELSE" } })).toBeNull();
    expect(errorCodeOf(new Error("network"))).toBeNull();
    expect(errorCodeOf(undefined)).toBeNull();
  });

  it("covers every auth error code the backend's handler can return", () => {
    // Transcribed from AuthExceptionHandler. If the backend adds one, this
    // fails rather than the UI silently falling through to a generic message.
    expect([...AUTH_ERROR_CODES].sort()).toEqual([
      "ACCOUNT_DEACTIVATED", "ACCOUNT_SUSPENDED", "EMAIL_ALREADY_REGISTERED",
      "INVALID_CREDENTIALS", "INVALID_OR_EXPIRED_CODE", "INVALID_REFRESH_TOKEN",
      "INVALID_TWO_FACTOR_CHALLENGE", "INVALID_TWO_FACTOR_CODE",
      "TENANT_NOT_ACTIVE", "TWO_FACTOR_LOCKED_OUT", "TWO_FACTOR_MANDATORY",
      "TWO_FACTOR_NOT_ENABLED", "TWO_FACTOR_SETUP_REQUIRED",
    ]);
  });
});
