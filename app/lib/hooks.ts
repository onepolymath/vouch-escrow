"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { deployment } from "./config";
import { vouchAbi } from "./abi";
import type { Deal } from "./deal";
import type { TrustData } from "./trust";

/** Unix seconds, ticking once a second so countdowns move. */
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function useDeal(id: bigint | undefined) {
  const q = useReadContract({
    address: deployment?.vouch,
    abi: vouchAbi,
    functionName: "getDeal",
    args: id === undefined ? undefined : [id],
    query: { enabled: !!deployment && id !== undefined, refetchInterval: 6_000 },
  });
  return { ...q, deal: q.data as Deal | undefined };
}

export function useAgentId(address: Address | undefined) {
  const q = useReadContract({
    address: deployment?.vouch,
    abi: vouchAbi,
    functionName: "agentIdOf",
    args: address ? [address] : undefined,
    query: { enabled: !!deployment && !!address, staleTime: 30_000 },
  });
  const [holds, handle] = (q.data as readonly [boolean, string] | undefined) ?? [undefined, undefined];
  return { holds, handle: holds ? handle || null : null, isLoading: q.isLoading };
}

export function useTrust(address: Address | undefined) {
  return useQuery({
    queryKey: ["trust", address],
    enabled: !!address,
    queryFn: async (): Promise<TrustData> => {
      const res = await fetch(`/api/trust/${address}`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Lookup failed");
      return res.json();
    },
  });
}
