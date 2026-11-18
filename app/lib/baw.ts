import type { Address } from "viem";
import type { RawCall } from "./calls";

/**
 * Commands for the Binance Agentic Wallet CLI (`baw`), taken from the documented
 * `contract-call preview` / `execute` flow. We never run anything: the user's own agent does,
 * and the user confirms. Chain 56 only, since Agentic Wallet works on mainnet.
 * Docs: github.com/binance/binance-skills-hub, binance-agentic-wallet/references/external-sign.md
 */
export function bawPreview(opts: { chainId: number; from: Address; call: RawCall }): string {
  return [
    "baw contract-call preview",
    `--binanceChainId ${opts.chainId}`,
    `--from ${opts.from}`,
    `--to ${opts.call.to}`,
    "--value 0",
    `--inputData ${opts.call.data}`,
    "--json",
  ].join(" ");
}

export const bawExecute = "baw contract-call execute --requestId <requestId from the preview> --json";

export const bawChecklist = [
  "Developer Mode is on in the Binance app (Agentic Wallet, Settings). It stays on for 7 days.",
  "Run the preview and read it. Check the contract address, the amount and any risk notes.",
  "Only run execute with the requestId from that preview, after you have confirmed.",
];
