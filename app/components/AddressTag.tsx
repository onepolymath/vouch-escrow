"use client";

import type { Address } from "viem";
import { useAgentId } from "@/lib/hooks";
import { explorerAddress } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import { Chip } from "./ui";

/** Shows the Agent ID handle when there is one, otherwise the short address. */
export function AddressTag({ address, you }: { address: Address; you?: boolean }) {
  const { holds, handle, isLoading } = useAgentId(address);
  const link = explorerAddress(address);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {handle ? <span className="font-semibold">{handle}</span> : null}
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-muted underline-offset-2 hover:underline"
        >
          {shortAddress(address)}
        </a>
      ) : (
        <span className="font-mono text-xs text-muted">{shortAddress(address)}</span>
      )}
      {!isLoading && holds === true ? <Chip tone="accent">Agent ID</Chip> : null}
      {!isLoading && holds === false ? <Chip tone="neutral">No Agent ID</Chip> : null}
      {you ? <Chip tone="neutral">you</Chip> : null}
    </span>
  );
}
