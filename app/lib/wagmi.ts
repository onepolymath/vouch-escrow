import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { deployment } from "./config";
import { bscTestnet } from "viem/chains";

const chain = deployment?.chain ?? bscTestnet;
const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

export const wagmiConfig = createConfig({
  chains: [chain],
  ssr: true,
  connectors: [
    injected(),
    ...(wcProjectId ? [walletConnect({ projectId: wcProjectId, showQrModal: true })] : []),
  ],
  transports: { [chain.id]: http(deployment?.rpcUrl) } as Record<number, ReturnType<typeof http>>,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
