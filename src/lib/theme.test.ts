import { describe, expect, it } from "vitest";
import { parsePreference, resolveMode } from "./theme";

describe("theme preference", () => {
  it("reads a stored choice, and anything else as following the device", () => {
    expect(parsePreference("day")).toBe("day");
    expect(parsePreference("night")).toBe("night");
    expect(parsePreference(null)).toBe("system");
    expect(parsePreference("dark")).toBe("system");
  });

  it("follows the device only when no choice was made", () => {
    expect(resolveMode("system", true)).toBe("night");
    expect(resolveMode("system", false)).toBe("day");
    expect(resolveMode("day", true)).toBe("day");
    expect(resolveMode("night", false)).toBe("night");
  });
});
