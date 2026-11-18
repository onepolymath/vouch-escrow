import { describe, expect, it } from "vitest";
import { zeroAddress, type Address } from "viem";
import {
  availableActions,
  reviewEndsAt,
  roleOf,
  stepper,
  Status,
  DISPUTE_TIMEOUT_SECS,
  type Deal,
} from "../lib/deal";

const SELLER = "0x00000000000000000000000000000000000000a1" as Address;
const BUYER = "0x00000000000000000000000000000000000000b2" as Address;
const ARBITER = "0x00000000000000000000000000000000000000c3" as Address;
const OTHER = "0x00000000000000000000000000000000000000d4" as Address;
const hash = `0x${"00".repeat(32)}` as const;

const NOW = 1_800_000_000;

function deal(over: Partial<Deal> = {}): Deal {
  return {
    seller: SELLER,
    buyer: zeroAddress,
    token: OTHER,
    arbiter: zeroAddress,
    amount: 100n * 10n ** 18n,
    deliverBy: BigInt(NOW + 7 * 86400),
    deliveredAt: 0n,
    disputedAt: 0n,
    reviewSecs: 2 * 86400,
    proposedSellerBps: 0,
    proposer: zeroAddress,
    status: Status.Open,
    buyerNeedsAgentId: true,
    termsHash: hash,
    proofHash: hash,
    evidenceHash: hash,
    ...over,
  };
}

describe("roleOf", () => {
  it("tells the parties apart, case-insensitively", () => {
    const d = deal({ buyer: BUYER, arbiter: ARBITER });
    expect(roleOf(d, SELLER)).toBe("seller");
    expect(roleOf(d, BUYER.toUpperCase().replace("0X", "0x") as Address)).toBe("buyer");
    expect(roleOf(d, ARBITER)).toBe("arbiter");
    expect(roleOf(d, OTHER)).toBe("visitor");
    expect(roleOf(d, undefined)).toBe("visitor");
  });

  it("an open deal has no buyer yet, so nobody matches the zero address", () => {
    expect(roleOf(deal(), zeroAddress)).toBe("visitor");
  });
});

describe("stepper", () => {
  it("follows the happy path", () => {
    expect(stepper(Status.Open)).toMatchObject({ current: 0, ended: false });
    expect(stepper(Status.Funded)).toMatchObject({ current: 1, ended: false });
    expect(stepper(Status.Delivered)).toMatchObject({ current: 2, ended: false });
    expect(stepper(Status.Released)).toMatchObject({ current: 3, ended: true, problem: false });
  });
  it("marks disputes and refunds as problems", () => {
    expect(stepper(Status.Disputed).problem).toBe(true);
    expect(stepper(Status.Refunded)).toMatchObject({ ended: true, problem: true });
    expect(stepper(Status.Cancelled)).toMatchObject({ ended: true, problem: true });
    expect(stepper(Status.Settled)).toMatchObject({ ended: true, problem: false });
  });
});

describe("availableActions", () => {
  it("open deal: seller can cancel, others can fund", () => {
    expect(availableActions(deal(), "seller", NOW)).toEqual(["cancel"]);
    expect(availableActions(deal(), "visitor", NOW)).toEqual(["fund"]);
    expect(availableActions(deal({ buyer: BUYER }), "buyer", NOW)).toEqual(["fund"]);
  });

  it("nobody can fund after the deadline, the arbiter never funds", () => {
    expect(availableActions(deal(), "visitor", NOW + 8 * 86400)).toEqual([]);
    expect(availableActions(deal(), "arbiter", NOW)).toEqual([]);
  });

  it("funded: seller delivers until the deadline, then anyone can refund", () => {
    const d = deal({ status: Status.Funded, buyer: BUYER });
    expect(availableActions(d, "seller", NOW)).toEqual(["markDelivered"]);
    expect(availableActions(d, "buyer", NOW)).toEqual([]);
    expect(availableActions(d, "seller", NOW + 8 * 86400)).toEqual(["refundExpired"]);
    expect(availableActions(d, "visitor", NOW + 8 * 86400)).toEqual(["refundExpired"]);
  });

  it("delivered: buyer approves or disputes inside the window", () => {
    const d = deal({ status: Status.Delivered, buyer: BUYER, deliveredAt: BigInt(NOW) });
    expect(reviewEndsAt(d)).toBe(NOW + 2 * 86400);
    expect(availableActions(d, "buyer", NOW + 100)).toEqual(["approve", "dispute"]);
    expect(availableActions(d, "seller", NOW + 100)).toEqual([]);
  });

  it("delivered: after the window anyone can release, buyer can no longer dispute", () => {
    const d = deal({ status: Status.Delivered, buyer: BUYER, deliveredAt: BigInt(NOW) });
    const late = NOW + 2 * 86400 + 1;
    expect(availableActions(d, "buyer", late)).toEqual(["approve", "releaseAfterWindow"]);
    expect(availableActions(d, "visitor", late)).toEqual(["releaseAfterWindow"]);
  });

  it("disputed: parties propose, only the other side accepts", () => {
    const base = deal({ status: Status.Disputed, buyer: BUYER, disputedAt: BigInt(NOW) });
    expect(availableActions(base, "seller", NOW)).toEqual(["proposeSplit"]);

    const sellerProposed = { ...base, proposer: SELLER, proposedSellerBps: 6000 };
    expect(availableActions(sellerProposed, "seller", NOW)).toEqual(["proposeSplit"]);
    expect(availableActions(sellerProposed, "buyer", NOW)).toEqual(["proposeSplit", "acceptSplit"]);
  });

  it("disputed: arbiter decides, anyone can settle after the timeout", () => {
    const d = deal({
      status: Status.Disputed,
      buyer: BUYER,
      arbiter: ARBITER,
      disputedAt: BigInt(NOW),
    });
    expect(availableActions(d, "arbiter", NOW)).toEqual(["arbiterResolve"]);
    expect(availableActions(d, "visitor", NOW)).toEqual([]);
    expect(availableActions(d, "visitor", NOW + DISPUTE_TIMEOUT_SECS + 1)).toEqual([
      "settleAfterTimeout",
    ]);
  });

  it("finished deals offer nothing", () => {
    for (const status of [Status.Released, Status.Settled, Status.Refunded, Status.Cancelled]) {
      expect(availableActions(deal({ status, buyer: BUYER }), "buyer", NOW)).toEqual([]);
    }
  });
});
