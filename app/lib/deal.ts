import type { Address } from "viem";
import { isAddressEqual, zeroAddress } from "viem";

export const Status = {
  Open: 0,
  Funded: 1,
  Delivered: 2,
  Released: 3,
  Disputed: 4,
  Settled: 5,
  Refunded: 6,
  Cancelled: 7,
} as const;

export type StatusCode = (typeof Status)[keyof typeof Status];

export type Deal = {
  seller: Address;
  buyer: Address;
  token: Address;
  arbiter: Address;
  amount: bigint;
  deliverBy: bigint;
  deliveredAt: bigint;
  disputedAt: bigint;
  reviewSecs: number;
  proposedSellerBps: number;
  proposer: Address;
  status: number;
  buyerNeedsAgentId: boolean;
  termsHash: `0x${string}`;
  proofHash: `0x${string}`;
  evidenceHash: `0x${string}`;
};

export const DISPUTE_TIMEOUT_SECS = 7 * 24 * 3600;

export type Tone = "neutral" | "accent" | "pending" | "dispute" | "danger";

export const statusLabel: Record<number, { label: string; tone: Tone; hint: string }> = {
  [Status.Open]: { label: "Open", tone: "neutral", hint: "Waiting for a buyer to fund it." },
  [Status.Funded]: { label: "Funded", tone: "pending", hint: "Money is in escrow. Waiting for delivery." },
  [Status.Delivered]: { label: "Delivered", tone: "pending", hint: "The buyer is reviewing the delivery." },
  [Status.Released]: { label: "Done", tone: "accent", hint: "The seller was paid." },
  [Status.Disputed]: { label: "Disputed", tone: "dispute", hint: "The buyer objected. A split is being sorted out." },
  [Status.Settled]: { label: "Settled", tone: "accent", hint: "The dispute ended with a split." },
  [Status.Refunded]: { label: "Refunded", tone: "neutral", hint: "The seller missed the deadline and the buyer got the money back." },
  [Status.Cancelled]: { label: "Cancelled", tone: "neutral", hint: "The seller pulled the deal before it was funded." },
};

export const stepLabels = ["Open", "Funded", "Delivered", "Done"] as const;

/** Where the stepper should be: index of the current step, and how the deal ended if it has. */
export function stepper(status: number): { current: number; ended: boolean; problem: boolean } {
  switch (status) {
    case Status.Open:
      return { current: 0, ended: false, problem: false };
    case Status.Funded:
      return { current: 1, ended: false, problem: false };
    case Status.Delivered:
      return { current: 2, ended: false, problem: false };
    case Status.Disputed:
      return { current: 2, ended: false, problem: true };
    case Status.Released:
    case Status.Settled:
      return { current: 3, ended: true, problem: false };
    case Status.Refunded:
      return { current: 1, ended: true, problem: true };
    default:
      return { current: 0, ended: true, problem: true };
  }
}

export type Role = "seller" | "buyer" | "arbiter" | "visitor";

export function roleOf(deal: Deal, account: Address | undefined): Role {
  if (!account) return "visitor";
  if (isAddressEqual(deal.seller, account)) return "seller";
  if (deal.buyer !== zeroAddress && isAddressEqual(deal.buyer, account)) return "buyer";
  if (deal.arbiter !== zeroAddress && isAddressEqual(deal.arbiter, account)) return "arbiter";
  return "visitor";
}

export function reviewEndsAt(deal: Deal): number {
  return deal.deliveredAt === 0n ? 0 : Number(deal.deliveredAt) + deal.reviewSecs;
}

/** Everything the page may offer the viewer right now. The contract has the last word. */
export type ActionKey =
  | "fund"
  | "cancel"
  | "markDelivered"
  | "approve"
  | "dispute"
  | "releaseAfterWindow"
  | "refundExpired"
  | "proposeSplit"
  | "acceptSplit"
  | "arbiterResolve"
  | "settleAfterTimeout";

export function availableActions(deal: Deal, role: Role, now: number): ActionKey[] {
  const out: ActionKey[] = [];
  const deliverBy = Number(deal.deliverBy);
  switch (deal.status) {
    case Status.Open:
      if (role === "seller") out.push("cancel");
      if (role !== "seller" && role !== "arbiter" && now < deliverBy) out.push("fund");
      break;
    case Status.Funded:
      if (role === "seller" && now <= deliverBy) out.push("markDelivered");
      if (now > deliverBy) out.push("refundExpired");
      break;
    case Status.Delivered: {
      const ends = reviewEndsAt(deal);
      if (role === "buyer") {
        out.push("approve");
        if (now <= ends) out.push("dispute");
      }
      if (now > ends) out.push("releaseAfterWindow");
      break;
    }
    case Status.Disputed: {
      if (role === "seller" || role === "buyer") {
        out.push("proposeSplit");
        const proposerIsMe =
          (role === "seller" && isAddressEqual(deal.proposer, deal.seller)) ||
          (role === "buyer" && isAddressEqual(deal.proposer, deal.buyer));
        if (deal.proposer !== zeroAddress && !proposerIsMe) out.push("acceptSplit");
      }
      if (role === "arbiter") out.push("arbiterResolve");
      if (now > Number(deal.disputedAt) + DISPUTE_TIMEOUT_SECS) out.push("settleAfterTimeout");
      break;
    }
    default:
      break;
  }
  return out;
}
