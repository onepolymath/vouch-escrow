import { describe, expect, it } from "vitest";
import { decodeFunctionData, erc20Abi, type Address } from "viem";
import { vouchAbi } from "../lib/abi";
import { steps, toRawCall } from "../lib/calls";
import { bawPreview } from "../lib/baw";

const VOUCH = "0x00000000000000000000000000000000000000f1" as Address;
const TOKEN = "0x00000000000000000000000000000000000000f2" as Address;
const ME = "0x00000000000000000000000000000000000000f3" as Address;

describe("steps", () => {
  it("funding is an exact-amount approval followed by fund, never unlimited", () => {
    const s = steps.fund(VOUCH, 7n, TOKEN, 123n);
    expect(s).toHaveLength(2);

    const approve = toRawCall(s[0]!);
    expect(approve.to).toBe(TOKEN);
    const a = decodeFunctionData({ abi: erc20Abi, data: approve.data });
    expect(a.functionName).toBe("approve");
    expect(a.args).toEqual([VOUCH, 123n]);

    const fund = toRawCall(s[1]!);
    expect(fund.to).toBe(VOUCH);
    const f = decodeFunctionData({ abi: vouchAbi, data: fund.data });
    expect(f.functionName).toBe("fund");
    expect(f.args).toEqual([7n]);
  });

  it("createDeal encodes the struct", () => {
    const [s] = steps.createDeal(VOUCH, {
      buyer: ME,
      token: TOKEN,
      amount: 5n,
      deliverBy: 99n,
      reviewSecs: 3600,
      buyerNeedsAgentId: true,
      arbiter: "0x0000000000000000000000000000000000000000",
      termsHash: `0x${"11".repeat(32)}`,
    });
    const d = decodeFunctionData({ abi: vouchAbi, data: toRawCall(s!).data });
    expect(d.functionName).toBe("createDeal");
  });

  it("every action targets the Vouch contract", () => {
    const hash = `0x${"22".repeat(32)}` as const;
    const all = [
      steps.cancel(VOUCH, 1n),
      steps.markDelivered(VOUCH, 1n, hash),
      steps.approve(VOUCH, 1n),
      steps.dispute(VOUCH, 1n, hash),
      steps.releaseAfterWindow(VOUCH, 1n),
      steps.refundExpired(VOUCH, 1n),
      steps.proposeSplit(VOUCH, 1n, 5000),
      steps.acceptSplit(VOUCH, 1n),
      steps.arbiterResolve(VOUCH, 1n, 5000),
      steps.settleAfterTimeout(VOUCH, 1n),
      steps.withdraw(VOUCH, TOKEN),
      steps.openProfile(VOUCH, hash),
    ].flat();
    for (const s of all) expect(toRawCall(s).to).toBe(VOUCH);
  });
});

describe("bawPreview", () => {
  it("builds the documented command", () => {
    const call = toRawCall(steps.approve(VOUCH, 3n)[0]!);
    const cmd = bawPreview({ chainId: 56, from: ME, call });
    expect(cmd).toContain("baw contract-call preview");
    expect(cmd).toContain("--binanceChainId 56");
    expect(cmd).toContain(`--from ${ME}`);
    expect(cmd).toContain(`--to ${VOUCH}`);
    expect(cmd).toContain("--value 0");
    expect(cmd).toContain(`--inputData ${call.data}`);
    expect(cmd.endsWith("--json")).toBe(true);
  });
});
