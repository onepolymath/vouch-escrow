import type { Address, Chain } from "viem";
import { bsc, bscTestnet, foundry } from "viem/chains";
import deployments from "./deployments.json";

export type TokenInfo = { symbol: string; address: Address; decimals: number };

export type Deployment = {
  chain: Chain;
  vouch: Address;
  agentId: Address;
  tokens: TokenInfo[];
  /** true when the registry is our own test stand-in rather than the real Agent ID contract */
  mockRegistry: boolean;
  rpcUrl: string;
};

type Stored = {
  chainId: number;
  vouch: Address;
  agentId: Address;
  token0: Address;
  token1: Address;
  mockRegistry: boolean;
  deployBlock: number;
} | null;

const chains: Record<number, Chain> = { 56: bsc, 97: bscTestnet, 31337: foundry };

const defaultRpc: Record<number, string> = {
  56: "https://bsc-dataseed.bnbchain.org",
  97: "https://bsc-testnet-rpc.publicnode.com",
  31337: "http://127.0.0.1:8545",
};

const symbols: Record<number, [string, string]> = {
  56: ["USDT", "USDC"],
  97: ["tUSDT", "tUSDC"],
  31337: ["tUSDT", "tUSDC"],
};

// Next only inlines NEXT_PUBLIC_ variables when they are written out in full like this.
// Reading them through `const e = process.env` works on the server and breaks in the browser.
function fromEnv(): Stored {
  if (!process.env.NEXT_PUBLIC_VOUCH_ADDRESS) return null;
  return {
    chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 97),
    vouch: process.env.NEXT_PUBLIC_VOUCH_ADDRESS as Address,
    agentId: process.env.NEXT_PUBLIC_AGENT_ID_ADDRESS as Address,
    token0: process.env.NEXT_PUBLIC_TOKEN0_ADDRESS as Address,
    token1: process.env.NEXT_PUBLIC_TOKEN1_ADDRESS as Address,
    mockRegistry: process.env.NEXT_PUBLIC_MOCK_REGISTRY === "true",
    deployBlock: 0,
  };
}

function resolve(): Deployment | null {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 97);
  const stored =
    fromEnv() ?? ((deployments as Record<string, Stored>)[String(chainId)] as Stored | undefined);
  if (!stored) return null;
  const chain = chains[stored.chainId];
  if (!chain) return null;
  const [s0, s1] = symbols[stored.chainId] ?? ["TOKEN0", "TOKEN1"];
  return {
    chain,
    vouch: stored.vouch,
    agentId: stored.agentId,
    mockRegistry: stored.mockRegistry,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? defaultRpc[stored.chainId] ?? "",
    tokens: [
      { symbol: s0, address: stored.token0, decimals: 18 },
      { symbol: s1, address: stored.token1, decimals: 18 },
    ],
  };
}

/** null until a deployment exists for the configured chain */
export const deployment = resolve();

export const isTestnet = deployment ? deployment.chain.id !== 56 : true;

export const explorerBase =
  deployment?.chain.id === 56
    ? "https://bscscan.com"
    : deployment?.chain.id === 97
      ? "https://testnet.bscscan.com"
      : null;

export function explorerAddress(address: string): string | null {
  return explorerBase ? `${explorerBase}/address/${address}` : null;
}

export function explorerTx(hash: string): string | null {
  return explorerBase ? `${explorerBase}/tx/${hash}` : null;
}
