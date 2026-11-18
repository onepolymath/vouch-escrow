import { createConfig, http } from "wagmi";
import { deployment } from "./config";
import { bscTestnet } from "viem/chains";

const chain = deployment?.chain ?? bscTestnet;

export const wagmiConfig = createConfig({
  chains: [chain],
  ssr: true,
  // No explicit connectors on purpose. Wallets announce themselves through EIP-6963 and wagmi
  // picks them up. Importing the connector barrel drags in every vendor SDK and breaks the build.
  connectors: [],
  transports: { [chain.id]: http(deployment?.rpcUrl) } as Record<number, ReturnType<typeof http>>,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
