import { describe, expect, it } from "vitest";
import { normalizeVerifyCode, verifyDocument } from "./documentsService";

describe("a verification code as people type it", () => {
  it("drops dashes and spaces, and ignores case", () => {
    expect(normalizeVerifyCode("d897-0a03-3c97-202d")).toBe("D8970A033C97202D");
    expect(normalizeVerifyCode("  D897 0A03 3C97 202D ")).toBe("D8970A033C97202D");
    expect(normalizeVerifyCode("D8970A033C97202D")).toBe("D8970A033C97202D");
  });

  it("takes the code out of a pasted verify link", () => {
    expect(normalizeVerifyCode("http://localhost:8443/verify/936819E19BDFBC9F")).toBe("936819E19BDFBC9F");
    expect(normalizeVerifyCode("https://hometrue.com.ng/verify/9368-19e1-9bdf-bc9f?x=1")).toBe("936819E19BDFBC9F");
  });
});

describe("verifying in demo mode", () => {
  it("knows the demo receipts and letters, and shows only what they carry", async () => {
    const v = await verifyDocument("qr-pld-240816-001");
    expect(v).toMatchObject({ documentType: "allocation_letter", issuedBy: "HomeTrue", developer: null, holderInitials: null });
  });

  it("answers an unknown code with the backend's one 404", async () => {
    await expect(verifyDocument("0000-0000-0000-0000")).rejects.toMatchObject({ status: 404, body: { code: "NOT_A_HOMETRUE_DOCUMENT" } });
  });
});
