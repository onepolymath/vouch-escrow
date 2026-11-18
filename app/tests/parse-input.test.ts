import { describe, expect, it } from "vitest";
import { parseInput } from "../lib/parse-input";

const ADDR = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";

describe("parseInput", () => {
  it("accepts an address", () => {
    expect(parseInput(ADDR)).toEqual({ kind: "address", address: ADDR });
    expect(parseInput(`  ${ADDR.toLowerCase()} `).kind).toBe("address");
  });

  it("accepts a deal link in a few shapes", () => {
    expect(parseInput("https://vouch.example/d/42")).toEqual({ kind: "deal", id: 42n });
    expect(parseInput("https://vouch.example/d/42?t=abc")).toEqual({ kind: "deal", id: 42n });
    expect(parseInput("/d/7#x")).toEqual({ kind: "deal", id: 7n });
  });

  it("refuses names on purpose", () => {
    expect(parseInput("alice.ai").kind).toBe("name");
    expect(parseInput("@alice").kind).toBe("name");
    expect(parseInput("alice").kind).toBe("name");
  });

  it("rejects everything else", () => {
    expect(parseInput("").kind).toBe("invalid");
    expect(parseInput("0x123").kind).toBe("invalid");
    expect(parseInput("https://example.com/other").kind).toBe("invalid");
  });
});
