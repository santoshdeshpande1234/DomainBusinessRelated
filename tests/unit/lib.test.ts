import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { convert, isFresh, usdPerUnit } from "@/lib/fx-math";
import { decrypt, encrypt, mask } from "@/lib/crypto";
import { can } from "@/lib/permissions";
import { safeNext } from "@/lib/redirect";
import { money } from "@/lib/format";

const rates = { USD: 1, INR: 83.2, EUR: 0.92 };

describe("fx", () => {
  it("converts through USD and rounds to cents", () => {
    expect(convert(100, "USD", "INR", rates)).toBe(8320);
    expect(convert(8320, "INR", "EUR", rates)).toBe(92);
    expect(usdPerUnit("INR", rates)).toBeCloseTo(0.01201923, 8);
    expect(() => convert(1, "USD", "XYZ", rates)).toThrow(/XYZ/);
  });
  it("treats rates as fresh for 12 hours", () => {
    const now = Date.parse("2026-10-21T12:00:00Z");
    expect(isFresh("2026-10-21T00:00:01Z", now)).toBe(true);
    expect(isFresh("2026-10-20T23:59:59Z", now)).toBe(false);
  });
});

describe("crypto", () => {
  const key = randomBytes(32).toString("base64");
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("sk-secret-1234", key), b = encrypt("sk-secret-1234", key);
    expect(a).not.toBe(b);
    expect(decrypt(a, key)).toBe("sk-secret-1234");
  });
  it("detects tampering and wrong keys", () => {
    const t = Buffer.from(encrypt("x", key), "base64"); t[t.length - 1] ^= 1;
    expect(() => decrypt(t.toString("base64"), key)).toThrow();
    expect(() => decrypt(encrypt("x", key), randomBytes(32).toString("base64"))).toThrow();
    expect(() => encrypt("x", "c2hvcnQ=")).toThrow(/32 bytes/);
  });
  it("masks secrets to the last 4 characters", () => {
    expect(mask("sk-abcdef1234", true)).toBe("••••1234");
    expect(mask("abc", true)).toBe("••••");
    expect(mask("user", false)).toBe("user");
  });
});

describe("permissions and helpers", () => {
  it("matches the role matrix", () => {
    expect(can("admin", "audit:read")).toBe(true);
    expect(can("member", "campaign:write")).toBe(true);
    expect(can("member", "campaign:delete")).toBe(false);
    expect(can("member", "integration:write")).toBe(false);
    expect(can("viewer", "campaign:write")).toBe(false);
  });
  it("only allows same-site redirects", () => {
    expect(safeNext("/campaigns?x=1")).toBe("/campaigns?x=1");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", null]) expect(safeNext(bad)).toBe("/");
  });
  it("formats money", () => {
    expect(money(1234.5, "USD")).toBe("$1,234.50");
    expect(money(null)).toBe("—");
  });
});
