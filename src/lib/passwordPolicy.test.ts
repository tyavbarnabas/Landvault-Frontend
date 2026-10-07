import { describe, it, expect } from "vitest";
import { assessPassword } from "./passwordPolicy";

const ok = (pw: string, personal = {}) => assessPassword(pw, personal).acceptable;

describe("password rule", () => {
  it("needs 8+ characters with letters and a number", () => {
    expect(ok("short1")).toBe(false);
    expect(ok("lettersonly")).toBe(false);
    expect(ok("1234567890")).toBe(false);
    expect(ok("harmattan7")).toBe(true);
  });

  it("refuses famous passwords, even with digits or symbols bolted on", () => {
    expect(ok("password123")).toBe(false);
    expect(ok("Password1!")).toBe(false);
    expect(ok("naija2024")).toBe(false);
    expect(ok("12345678abc")).toBe(false);
    expect(ok("aaaaaaaa1")).toBe(true); // repeated-letter rule is whole-password only
  });

  it("refuses the user's own name or email", () => {
    const me = { email: "emeka.okonkwo@example.com", firstName: "Emeka", lastName: "Okonkwo" };
    expect(ok("emeka2026xyz", me)).toBe(false);
    expect(ok("Okonkwo#2026", me)).toBe(false);
    expect(ok("harmattan7", me)).toBe(true);
  });

  it("gives the first unmet requirement as the error", () => {
    expect(assessPassword("abc").problem).toBe("Use at least 8 characters.");
    expect(assessPassword("harmattan7").problem).toBeNull();
  });

  it("rates strength: weak until acceptable, strong with length and variety", () => {
    expect(assessPassword("abc").strength).toBe("weak");
    expect(assessPassword("harmattan7").strength).toBe("fair");
    expect(assessPassword("Harmattan-season-7").strength).toBe("strong");
  });
});
