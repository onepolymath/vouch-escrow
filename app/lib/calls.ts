import { encodeFunctionData, erc20Abi, type Abi, type Address, type Hex } from "viem";
import { vouchAbi } from "./abi";

/** One transaction, described the way wagmi wants it and also encodable as raw calldata. */
export type Step = {
  label: string;
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

export type RawCall = { label: string; to: Address; data: Hex };

export function toRawCall(step: Step): RawCall {
  return {
    label: step.label,
    to: step.address,
    data: encodeFunctionData({
      abi: step.abi,
      functionName: step.functionName,
      args: step.args,
    } as Parameters<typeof encodeFunctionData>[0]),
  };
}

const v = (
  vouch: Address,
  label: string,
  functionName: string,
  args: readonly unknown[],
): Step => ({
  label,
  address: vouch,
  abi: vouchAbi as Abi,
  functionName,
  args,
});

export type CreateInput = {
  buyer: Address;
  token: Address;
  amount: bigint;
  deliverBy: bigint;
  reviewSecs: number;
  buyerNeedsAgentId: boolean;
  arbiter: Address;
  termsHash: Hex;
};

export const steps = {
  createDeal: (vouch: Address, p: CreateInput) => [v(vouch, "Create the deal", "createDeal", [p])],

  /** Exact amount only, never an unlimited approval. */
  fund: (vouch: Address, id: bigint, token: Address, amount: bigint): Step[] => [
    {
      label: "Approve the exact amount",
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [vouch, amount],
    },
    v(vouch, "Fund the deal", "fund", [id]),
  ],

  cancel: (vouch: Address, id: bigint) => [v(vouch, "Cancel the deal", "cancel", [id])],
  markDelivered: (vouch: Address, id: bigint, proof: Hex) => [
    v(vouch, "Mark as delivered", "markDelivered", [id, proof]),
  ],
  approve: (vouch: Address, id: bigint) => [
    v(vouch, "Approve and pay the seller", "approve", [id]),
  ],
  dispute: (vouch: Address, id: bigint, evidence: Hex) => [
    v(vouch, "Open a dispute", "dispute", [id, evidence]),
  ],
  releaseAfterWindow: (vouch: Address, id: bigint) => [
    v(vouch, "Pay the seller, review window is over", "releaseAfterWindow", [id]),
  ],
  refundExpired: (vouch: Address, id: bigint) => [
    v(vouch, "Refund the buyer, deadline was missed", "refundExpired", [id]),
  ],
  proposeSplit: (vouch: Address, id: bigint, sellerBps: number) => [
    v(vouch, "Propose a split", "proposeSplit", [id, sellerBps]),
  ],
  acceptSplit: (vouch: Address, id: bigint) => [
    v(vouch, "Accept the proposed split", "acceptSplit", [id]),
  ],
  arbiterResolve: (vouch: Address, id: bigint, sellerBps: number) => [
    v(vouch, "Decide the split", "arbiterResolve", [id, sellerBps]),
  ],
  settleAfterTimeout: (vouch: Address, id: bigint) => [
    v(vouch, "Settle with an even split", "settleAfterTimeout", [id]),
  ],
  withdraw: (vouch: Address, token: Address) => [
    v(vouch, "Withdraw held funds", "withdraw", [token]),
  ],
  openProfile: (vouch: Address, hash: Hex) => [
    v(vouch, "Open your profile", "openProfile", [hash]),
  ],
};
