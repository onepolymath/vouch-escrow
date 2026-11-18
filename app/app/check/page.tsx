"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckBox } from "@/components/CheckBox";
import { NotDeployed } from "@/components/NotDeployed";
import { TrustCard } from "@/components/TrustCard";
import { Card, Notice } from "@/components/ui";
import { deployment } from "@/lib/config";
import { useDeal, useTrust } from "@/lib/hooks";
import { parseInput } from "@/lib/parse-input";
import type { Address } from "viem";
import { AddressTag } from "@/components/AddressTag";
import { statusLabel } from "@/lib/deal";
import { formatAmount } from "@/lib/format";
import { Chip } from "@/components/ui";

function AddressResult({ address }: { address: Address }) {
  const { data, isLoading, error } = useTrust(address);
  if (isLoading) return <p className="text-sm text-muted">Reading the chain…</p>;
  if (error) return <Notice tone="danger">{error.message}</Notice>;
  return data ? <TrustCard data={data} /> : null;
}

function DealResult({ id }: { id: bigint }) {
  const { deal, isLoading, error } = useDeal(id);
  if (isLoading) return <p className="text-sm text-muted">Reading the chain…</p>;
  if (error || !deal) return <Notice tone="danger">There is no deal with that number.</Notice>;
  const meta = statusLabel[deal.status];
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold">Deal #{id.toString()}</p>
          {meta ? <Chip tone={meta.tone}>{meta.label}</Chip> : null}
        </div>
        <p className="num mt-2 text-2xl font-semibold">{formatAmount(deal.amount)}</p>
        <p className="mt-3 text-sm text-muted">Seller</p>
        <AddressTag address={deal.seller} />
        <Link href={`/d/${id}`} className="mt-4 inline-block text-sm font-medium text-accent underline">
          Open the deal
        </Link>
      </Card>
      <h2 className="text-lg font-semibold">The seller&apos;s record</h2>
      <AddressResult address={deal.seller} />
    </div>
  );
}

function Result() {
  const q = useSearchParams().get("q") ?? "";
  if (!q) return null;
  const parsed = parseInput(q);
  switch (parsed.kind) {
    case "address":
      return <AddressResult address={parsed.address} />;
    case "deal":
      return <DealResult id={parsed.id} />;
    case "name":
      return (
        <Notice tone="pending" title="Vouch checks addresses, not names">
          Looking up someone&apos;s wallet from their Agent ID name isn&apos;t something this tool does.
          Ask them for their wallet address, or open the deal link they sent you.
        </Notice>
      );
    default:
      return <Notice tone="danger">That doesn&apos;t look like an address or a Vouch deal link.</Notice>;
  }
}

function Inner() {
  const q = useSearchParams().get("q") ?? "";
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Check before you pay</h1>
        <p className="mt-2 text-muted">See whether an address holds an Agent ID and what its record on Vouch shows.</p>
      </div>
      <CheckBox initial={q} compact />
      {!deployment ? <NotDeployed /> : <Result />}
    </div>
  );
}

export default function CheckPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
