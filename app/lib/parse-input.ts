import { isAddress, type Address } from "viem";

export type ParsedInput =
  | { kind: "address"; address: Address }
  | { kind: "deal"; id: bigint }
  | { kind: "name" }
  | { kind: "invalid" };

/**
 * The trust check takes an address or a deal link. It deliberately does not take names:
 * looking up someone's wallet by their Agent ID name is off limits under the hackathon rules.
 */
export function parseInput(raw: string): ParsedInput {
  const t = raw.trim();
  if (!t) return { kind: "invalid" };
  if (isAddress(t, { strict: false })) return { kind: "address", address: t as Address };

  const deal = t.match(/\/d\/(\d{1,12})(?:[/?#]|$)/);
  if (deal?.[1]) return { kind: "deal", id: BigInt(deal[1]) };

  if (/^@?[a-z0-9]{1,32}(\.ai)?$/i.test(t)) return { kind: "name" };
  return { kind: "invalid" };
}
