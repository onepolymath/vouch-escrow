import { describe, expect, it } from "vitest";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";
import { explainError } from "../lib/errors";

describe("explainError", () => {
  it("turns a user rejection into plain words", () => {
    const err = new UserRejectedRequestError(new Error("nope"));
    expect(explainError(new BaseError("outer", { cause: err }))).toMatch(/cancelled/i);
  });

  it("maps known custom errors", () => {
    const reverted = new ContractFunctionRevertedError({
      abi: [
        { type: "error", name: "NotAgentIdHolder", inputs: [{ name: "who", type: "address" }] },
      ],
      data: "0x" as `0x${string}`,
      functionName: "createDeal",
    });
    Object.defineProperty(reverted, "data", {
      value: { errorName: "NotAgentIdHolder", args: [] },
    });
    expect(explainError(new BaseError("outer", { cause: reverted }))).toMatch(/Agent ID/);
  });

  it("falls back to the short message and to plain errors", () => {
    expect(explainError(new BaseError("short one"))).toBe("short one");
    expect(explainError(new Error("plain"))).toBe("plain");
    expect(explainError("weird")).toBe("Something went wrong.");
  });
});
