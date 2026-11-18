"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { AddressTag } from "@/components/AddressTag";
import { DealActions } from "@/components/DealActions";
import { NotDeployed } from "@/components/NotDeployed";
import { Stepper } from "@/components/Stepper";
import { TrustCard } from "@/components/TrustCard";
import { Card, Chip, Field, inputClass, Notice } from "@/components/ui";
import { deployment } from "@/lib/config";
import { availableActions, reviewEndsAt, roleOf, statusLabel, Status } from "@/lib/deal";
import { formatAmount, formatDuration, formatUtc } from "@/lib/format";
import { useDeal, useNow, useTrust } from "@/lib/hooks";
import { decodeTerms, hashNote, hashTerms } from "@/lib/terms";
import { zeroAddress } from "viem";

function Verify({ label, hash }: { label: string; hash: string }) {
  const [text, setText] = useState("");
  const match = text.trim() ? hashNote(text) === hash : null;
  return (
    <Field
      label={label}
      hint="Paste the text you were sent. It should hash to what is recorded on chain."
    >
      <textarea
        className={`${inputClass} min-h-20 py-3`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {match !== null ? (
        <span
          className={`mt-1.5 block text-xs font-medium ${match ? "text-accent" : "text-danger"}`}
        >
          {match
            ? "Matches what is recorded on chain."
            : "Does not match what is recorded on chain."}
        </span>
      ) : null}
    </Field>
  );
}

function Countdown({
  to,
  now,
  label,
  live,
}: {
  to: number;
  now: number;
  label: string;
  live: boolean;
}) {
  const left = to - now;
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{formatUtc(to)}</dd>
      {live ? (
        <dd className="num text-xs text-muted">
          {left > 0 ? `${formatDuration(left)} left` : "passed"}
        </dd>
      ) : null}
    </div>
  );
}

function DealView({ id }: { id: bigint }) {
  const search = useSearchParams();
  const { address } = useAccount();
  const now = useNow();
  const { deal, isLoading, error } = useDeal(id);
  const sellerTrust = useTrust(deal?.seller);

  const [stored, setStored] = useState<string | null>(null);
  useEffect(() => {
    try {
      setStored(localStorage.getItem(`vouch:terms:${deployment?.chain.id}:${id}`));
    } catch {
      setStored(null);
    }
  }, [id]);

  const terms = useMemo(() => decodeTerms(search.get("t") ?? stored), [search, stored]);

  if (isLoading) return <p className="text-muted">Reading the chain…</p>;
  if (error || !deal)
    return <Notice tone="danger">There is no deal with number {id.toString()}.</Notice>;

  const token = deployment?.tokens.find(
    (t) => t.address.toLowerCase() === deal.token.toLowerCase(),
  );
  const symbol = token?.symbol ?? "tokens";
  const role = roleOf(deal, address);
  const actions = availableActions(deal, role, now);
  const meta = statusLabel[deal.status];
  const termsOk = terms ? hashTerms(terms) === deal.termsHash : null;
  const ends = reviewEndsAt(deal);
  const hasBuyer = deal.buyer !== zeroAddress;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Deal #{id.toString()}</p>
          {meta ? <Chip tone={meta.tone}>{meta.label}</Chip> : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {terms && termsOk ? terms.title : `Deal #${id}`}
        </h1>
        <p className="num text-3xl font-semibold">
          {formatAmount(deal.amount)} <span className="text-lg text-muted">{symbol}</span>
        </p>
      </div>

      <Card className="space-y-5">
        <Stepper status={deal.status} />
        {meta ? <p className="text-sm text-muted">{meta.hint}</p> : null}
        {role !== "visitor" ? (
          <p className="text-sm">
            You are the <strong>{role}</strong> on this deal.
          </p>
        ) : null}
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Terms</h2>
        {terms && termsOk ? (
          <>
            <p className="whitespace-pre-wrap text-sm">{terms.body}</p>
            <p className="text-xs font-medium text-accent">
              These terms match the fingerprint recorded on chain.
            </p>
          </>
        ) : terms && termsOk === false ? (
          <Notice tone="danger" title="These terms don't match the deal">
            The text in this link hashes to something different from what the seller recorded on
            chain. Don&apos;t rely on it.
          </Notice>
        ) : (
          <Notice>
            This link doesn&apos;t include the terms text. Ask the seller for the original link. The
            deal only stores a fingerprint of them.
          </Notice>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">People</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Seller</dt>
            <dd className="mt-1">
              <AddressTag address={deal.seller} you={role === "seller"} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Buyer</dt>
            <dd className="mt-1">
              {hasBuyer ? (
                <AddressTag address={deal.buyer} you={role === "buyer"} />
              ) : (
                <span className="text-muted">
                  Open to anyone{deal.buyerNeedsAgentId ? " who holds an Agent ID" : ""}
                </span>
              )}
            </dd>
          </div>
          {deal.arbiter !== zeroAddress ? (
            <div>
              <dt className="text-xs text-muted">Arbiter</dt>
              <dd className="mt-1">
                <AddressTag address={deal.arbiter} you={role === "arbiter"} />
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <Card>
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Countdown
            to={Number(deal.deliverBy)}
            now={now}
            label="Deliver by"
            live={deal.status <= Status.Funded}
          />
          <div>
            <dt className="text-xs text-muted">Review window</dt>
            <dd className="mt-0.5 font-medium">{formatDuration(deal.reviewSecs)}</dd>
            {ends > 0 ? <dd className="num text-xs text-muted">ends {formatUtc(ends)}</dd> : null}
          </div>
          <div>
            <dt className="text-xs text-muted">If nobody agrees in a dispute</dt>
            <dd className="mt-0.5 font-medium">Even split after 7 days</dd>
          </div>
        </dl>
      </Card>

      <DealActions id={id} deal={deal} role={role} actions={actions} now={now} symbol={symbol} />

      {deal.status >= Status.Delivered && deal.proofHash !== `0x${"0".repeat(64)}` ? (
        <Card className="space-y-4">
          <h2 className="font-semibold">Check the paperwork</h2>
          <Verify label="Delivery note" hash={deal.proofHash} />
          {deal.evidenceHash !== `0x${"0".repeat(64)}` ? (
            <Verify label="Dispute note" hash={deal.evidenceHash} />
          ) : null}
        </Card>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">The seller&apos;s record</h2>
        {sellerTrust.data ? (
          <TrustCard data={sellerTrust.data} />
        ) : (
          <p className="text-sm text-muted">Reading the chain…</p>
        )}
      </div>
    </div>
  );
}

function Inner({ id }: { id: string }) {
  if (!deployment) return <NotDeployed />;
  if (!/^\d{1,12}$/.test(id)) return <Notice tone="danger">That is not a deal number.</Notice>;
  return <DealView id={BigInt(id)} />;
}

export default function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <Inner id={id} />
    </Suspense>
  );
}
