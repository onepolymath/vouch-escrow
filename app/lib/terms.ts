import { keccak256, toBytes, type Hex } from "viem";

export type Terms = { title: string; body: string };

/** Canonical form, so the same words always give the same hash. */
function canonical(t: Terms): string {
  return JSON.stringify({ title: t.title.trim(), body: t.body.trim() });
}

export function hashTerms(t: Terms): Hex {
  return keccak256(toBytes(canonical(t)));
}

/** A plain note (delivery note, dispute evidence) is hashed as its trimmed text. */
export function hashNote(text: string): Hex {
  return keccak256(toBytes(text.trim()));
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** The deal link carries the terms text, only the hash goes on chain. */
export function encodeTerms(t: Terms): string {
  return toBase64Url(canonical(t));
}

export function decodeTerms(param: string | null | undefined): Terms | null {
  if (!param) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(param));
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Terms).title === "string" &&
      typeof (parsed as Terms).body === "string"
    ) {
      return { title: (parsed as Terms).title, body: (parsed as Terms).body };
    }
  } catch {
    // fall through, a bad link just means no terms shown
  }
  return null;
}
