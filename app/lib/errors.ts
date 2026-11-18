import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

const friendly: Record<string, string> = {
  NotAgentIdHolder: "That wallet does not hold an Agent ID, so it can't take part in this step.",
  TokenNotAllowed: "That token is not supported.",
  AmountOutOfRange: "The amount is outside the allowed range (1 to 1,000).",
  BadDeadline: "The deadline has to be in the future, and no more than 180 days away.",
  BadReviewWindow: "The review window has to be between 1 hour and 14 days.",
  BadParties: "The seller, buyer and arbiter have to be different addresses.",
  NoSuchDeal: "There is no deal with that number.",
  WrongStatus: "The deal is not in the right state for that. Refresh and try again.",
  NotSeller: "Only the seller can do that.",
  NotBuyer: "Only the buyer can do that.",
  NotNamedBuyer: "This deal was made for a specific buyer, and that is not you.",
  NotArbiter: "Only the arbiter named on this deal can do that.",
  NotAParty: "Only the seller or the buyer can do that.",
  DeadlinePassed: "The deadline has passed.",
  DeadlineNotReached: "The deadline has not passed yet.",
  ReviewWindowOpen: "The buyer's review window is still open.",
  ReviewWindowClosed: "The review window has closed, so a dispute is no longer possible.",
  DisputeStillRunning: "The dispute period is not over yet.",
  NoProposal: "There is no split proposal to accept yet.",
  OwnProposal: "You can't accept your own proposal. The other side has to.",
  BadSplit: "A split has to be between 0 and 100 percent.",
  UnexpectedTransferAmount: "This token took a fee on transfer, which Vouch does not support.",
  NothingToWithdraw: "There is nothing to withdraw.",
};

/** Turns whatever the wallet or RPC threw into one sentence a person can act on. */
export function explainError(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError))
      return "You cancelled the request in your wallet.";
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && friendly[name]) return friendly[name];
      if (reverted.reason) return reverted.reason;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
