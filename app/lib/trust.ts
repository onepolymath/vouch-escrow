import { zeroAddress, type Address, type PublicClient } from "viem";
import { vouchAbi } from "./abi";

export type TrustData = {
  address: Address;
  holdsAgentId: boolean;
  handle: string | null;
  record: {
    completedAsSeller: number;
    completedAsBuyer: number;
    settledDisputes: number;
    disputesAgainst: number;
    disputesOpened: number;
    missedDeadlines: number;
    /** 18 decimal units, as a string so JSON survives it */
    volume: string;
    since: number | null;
  };
  dealCount: number;
  profileHash: string | null;
};

export async function readTrust(
  client: Pick<PublicClient, "readContract">,
  vouch: Address,
  address: Address,
): Promise<TrustData> {
  const [agent, record, count, profile] = await Promise.all([
    client.readContract({
      address: vouch,
      abi: vouchAbi,
      functionName: "agentIdOf",
      args: [address],
    }),
    client.readContract({
      address: vouch,
      abi: vouchAbi,
      functionName: "trackRecord",
      args: [address],
    }),
    client.readContract({
      address: vouch,
      abi: vouchAbi,
      functionName: "dealCountOf",
      args: [address],
    }),
    client.readContract({
      address: vouch,
      abi: vouchAbi,
      functionName: "profileOf",
      args: [address],
    }),
  ]);
  const [holds, handle] = agent;
  const noProfile = /^0x0+$/.test(profile);
  return {
    address,
    holdsAgentId: holds,
    handle: holds && handle ? handle : null,
    record: {
      completedAsSeller: record.completedAsSeller,
      completedAsBuyer: record.completedAsBuyer,
      settledDisputes: record.settledDisputes,
      disputesAgainst: record.disputesAgainst,
      disputesOpened: record.disputesOpened,
      missedDeadlines: record.missedDeadlines,
      volume: record.volume.toString(),
      since: record.since === 0n ? null : Number(record.since),
    },
    dealCount: Number(count),
    profileHash: noProfile ? null : profile,
  };
}

export const isZero = (a: string) => a === zeroAddress;
