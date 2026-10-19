import { describe, expect, it } from "vitest";
import { formatDay } from "./formatDate";

describe("formatDay", () => {
  it("shows a calendar day as that day, whatever the time zone", () => {
    expect(formatDay("2026-10-16")).toBe("16 Oct 2026");
    expect(formatDay("2026-01-01")).toBe("1 Jan 2026");
  });

  it("leaves something that isn't a date as it came", () => {
    expect(formatDay("soon")).toBe("soon");
  });
});
