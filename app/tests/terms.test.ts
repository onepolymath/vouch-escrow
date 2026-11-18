import { describe, expect, it } from "vitest";
import { decodeTerms, encodeTerms, hashNote, hashTerms } from "../lib/terms";

describe("terms", () => {
  const t = { title: "Logo pack", body: "3 options, 2 rounds of edits. Délivré en lien." };

  it("round-trips through the link encoding, including non-ascii", () => {
    expect(decodeTerms(encodeTerms(t))).toEqual(t);
  });

  it("hash ignores surrounding whitespace but not words", () => {
    expect(hashTerms({ title: " Logo pack ", body: t.body + "\n" })).toBe(hashTerms(t));
    expect(hashTerms({ ...t, body: t.body + "!" })).not.toBe(hashTerms(t));
  });

  it("hash matches what the link would show", () => {
    const decoded = decodeTerms(encodeTerms(t));
    expect(decoded && hashTerms(decoded)).toBe(hashTerms(t));
  });

  it("garbage in a link means no terms, not a crash", () => {
    expect(decodeTerms("not base64 at all !!")).toBeNull();
    expect(decodeTerms("")).toBeNull();
    expect(decodeTerms(null)).toBeNull();
    expect(decodeTerms(btoa('{"title":1}'))).toBeNull();
  });

  it("notes hash their trimmed text", () => {
    expect(hashNote("  done  ")).toBe(hashNote("done"));
  });
});
