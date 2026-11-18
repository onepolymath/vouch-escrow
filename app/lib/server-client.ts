import { createPublicClient, http } from "viem";
import { deployment } from "./config";

/** Read-only client for route handlers. Null when nothing is deployed on the configured chain. */
export const serverClient = deployment
  ? createPublicClient({ chain: deployment.chain, transport: http(deployment.rpcUrl) })
  : null;
