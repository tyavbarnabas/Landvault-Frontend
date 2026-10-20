// The sign-up phone number: one international number from the dial code and
// what was typed, with the domestic 0 dropped and a sensible length.

import { describe, expect, it } from "vitest";
import { displayInternational, phoneProblem, toInternational } from "./phone";

describe("toInternational", () => {
  it("drops the domestic 0 and the spacing", () => {
    expect(toInternational("NG", "0803 000 0000")).toBe("+2348030000000");
    expect(toInternational("GB", "07700 900123")).toBe("+447700900123");
    expect(toInternational("GB", "7700-900-123")).toBe("+447700900123");
  });
  it("accepts a number pasted with its own code", () => {
    expect(toInternational("NG", "+234 803 000 0000")).toBe("+2348030000000");
    expect(toInternational("GB", "0044 7700 900123")).toBe("+447700900123");
  });
  it("keeps Italy's leading 0", () => {
    expect(toInternational("IT", "06 1234 5678")).toBe("+390612345678");
  });
});

describe("displayInternational", () => {
  it("reads back in groups", () => {
    expect(displayInternational("GB", "07700900123")).toBe("+44 7700 900 123");
    expect(displayInternational("NG", "08030000000")).toBe("+234 8030 000 000");
  });
});

describe("phoneProblem", () => {
  it("passes a number of the right length", () => {
    expect(phoneProblem("NG", "0803 000 0000")).toBeNull();
    expect(phoneProblem("US", "(202) 555-0143")).toBeNull();
  });
  it("names a short or long number for the country", () => {
    expect(phoneProblem("GB", "7700 90")).toMatch(/too short for a United Kingdom number/);
    expect(phoneProblem("NG", "0803 000 0000 1")).toMatch(/too long for a Nigeria number/);
  });
  it("refuses letters", () => {
    expect(phoneProblem("NG", "0803 abc")).toBe("Use digits only.");
  });
});
