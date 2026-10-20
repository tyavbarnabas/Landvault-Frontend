// Where a refused sign-up's reasons show: the backend's 400 VALIDATION_ERROR
// carries fieldErrors by field; phone goes on the phone field.

import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/apiClient";
import { registerErrors } from "./Register";

const refused = (body: ConstructorParameters<typeof ApiError>[2]) => new ApiError(400, "Request failed", body);

describe("registerErrors", () => {
  it("puts a refused phone on the phone field, with the backend's words", () => {
    const err = refused({ code: "VALIDATION_ERROR", fieldErrors: { phone: "Enter your number with its country code, e.g. +2348030000000." } });
    expect(registerErrors(err)).toEqual({ phone: "Enter your number with its country code, e.g. +2348030000000.", form: undefined });
  });
  it("names any other field under the form", () => {
    const err = refused({ code: "VALIDATION_ERROR", fieldErrors: { email: "Must be a valid email.", phone: "Enter your number…" } });
    expect(registerErrors(err)).toEqual({ phone: "Enter your number…", form: "Email: Must be a valid email." });
  });
  it("uses the backend's message when there are no field errors", () => {
    expect(registerErrors(refused({ code: "EMAIL_TAKEN", message: "An account with this email already exists." })).form).toBe("An account with this email already exists.");
    expect(registerErrors(refused({ code: "VALIDATION_ERROR" })).form).toBe("Registration failed. Please try again.");
  });
});
