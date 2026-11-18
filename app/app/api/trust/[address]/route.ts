import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { deployment } from "@/lib/config";
import { serverClient } from "@/lib/server-client";
import { readTrust } from "@/lib/trust";

export const dynamic = "force-dynamic";

/**
 * GET /api/trust/0x...  holds an Agent ID? handle? track record on Vouch.
 * Address in, data out. There is deliberately no lookup by name.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!isAddress(address, { strict: false })) {
    return NextResponse.json({ error: "Not a valid address" }, { status: 400 });
  }
  if (!deployment || !serverClient) {
    return NextResponse.json({ error: "Vouch is not deployed on this network yet" }, { status: 503 });
  }
  try {
    const data = await readTrust(serverClient, deployment.vouch, address);
    return NextResponse.json(
      { chainId: deployment.chain.id, contract: deployment.vouch, ...data },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } },
    );
  } catch {
    return NextResponse.json({ error: "Could not read the chain, try again" }, { status: 502 });
  }
}
