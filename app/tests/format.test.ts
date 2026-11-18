import { describe, expect, it } from "vitest";
import { formatAmount, formatDuration, formatUtc, parseAmount, shortAddress } from "../lib/format";

describe("formatAmount", () => {
  it("shows two decimals and thousands separators", () => {
    expect(formatAmount(1_234_567_890_000_000_000_000n)).toBe("1,234.56");
    expect(formatAmount(100n * 10n ** 18n)).toBe("100.00");
  });
  it("handles small and zero values", () => {
    expect(formatAmount(0n)).toBe("0.00");
    expect(formatAmount(5n * 10n ** 15n)).toBe("0.00");
  });
  it("respects other decimals", () => {
    expect(formatAmount(2_500_000n, 6)).toBe("2.50");
    expect(formatAmount(7n, 0, 0)).toBe("7");
  });
});

describe("parseAmount", () => {
  it("accepts plain decimals", () => {
    expect(parseAmount("120")).toBe(120n * 10n ** 18n);
    expect(parseAmount(" 0.5 ")).toBe(5n * 10n ** 17n);
  });
  it("rejects junk, negatives, zero and too many decimals", () => {
    for (const bad of ["", "abc", "-1", "0", "1e3", "1,000", "1.", ".5", "0.0000000000000000001"]) {
      expect(parseAmount(bad)).toBeNull();
    }
  });
});

describe("formatDuration", () => {
  it("picks the two biggest units", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(61)).toBe("1m");
    expect(formatDuration(3600 + 120)).toBe("1h 2m");
    expect(formatDuration(2 * 86400)).toBe("2d");
    expect(formatDuration(2 * 86400 + 5 * 3600 + 99)).toBe("2d 5h");
    expect(formatDuration(-5)).toBe("0s");
  });
});

describe("formatUtc", () => {
  it("prints a short UTC date", () => {
    expect(formatUtc(1_795_000_000)).toBe("18 Nov 11:06 UTC");
  });
});

describe("shortAddress", () => {
  it("shortens long addresses and leaves short ones", () => {
    expect(shortAddress("0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F")).toBe("0x60B9…022F");
    expect(shortAddress("0x1234")).toBe("0x1234");
  });
});
