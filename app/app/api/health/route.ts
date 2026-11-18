import { NextResponse } from "next/server";
import { deployment } from "@/lib/config";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    chainId: deployment?.chain.id ?? null,
    contract: deployment?.vouch ?? null,
  });
}
