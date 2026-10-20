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
    expect(displayInternational("NG", "08054443322")).toBe("+234 805 444 3322");
    expect(displayInternational("GB", "07700900123")).toBe("+44 770 090 0123");
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

describe("stored international numbers", () => {
  it("finds the country and the digits", async () => {
    const { splitInternational } = await import("./phone");
    expect(splitInternational("+2348054443322")).toEqual({ iso: "NG", number: "8054443322" });
    expect(splitInternational("+447700900123")).toEqual({ iso: "GB", number: "7700900123" });
    expect(splitInternational("+12025550143")).toEqual({ iso: "US", number: "2025550143" });
    expect(splitInternational("0805 444 3322")).toEqual({ iso: "NG", number: "0805 444 3322" });
  });
  it("checks the E.164 shape and the country's length", async () => {
    const { internationalPhoneProblem } = await import("./phone");
    expect(internationalPhoneProblem("+2348054443322")).toBeNull();
    expect(internationalPhoneProblem("0805 444 3322")).toMatch(/country code/);
    expect(internationalPhoneProblem("+234805444")).toMatch(/too short for a Nigeria number/);
    expect(internationalPhoneProblem("")).toBe("Enter a phone number.");
  });
});
