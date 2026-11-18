"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { decodeEventLog, isAddress, zeroAddress, type Address } from "viem";
import { useAccount } from "wagmi";
import { TxButton } from "@/components/TxButton";
import { AgentDrawer } from "@/components/AgentDrawer";
import { NotDeployed } from "@/components/NotDeployed";
import { Button, Card, Field, inputClass, Notice, Toggle } from "@/components/ui";
import { vouchAbi } from "@/lib/abi";
import { steps } from "@/lib/calls";
import { deployment } from "@/lib/config";
import { formatAmount, parseAmount } from "@/lib/format";
import { useAgentId } from "@/lib/hooks";
import { encodeTerms, hashTerms } from "@/lib/terms";

const reviewOptions = [
  { label: "24 hours", secs: 24 * 3600 },
  { label: "48 hours", secs: 48 * 3600 },
  { label: "72 hours", secs: 72 * 3600 },
  { label: "7 days", secs: 7 * 24 * 3600 },
];

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function NewDealPage() {
  const { address } = useAccount();
  const { holds, handle } = useAgentId(address);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tokenIdx, setTokenIdx] = useState(0);
  const [amountText, setAmountText] = useState("");
  const [deliverBy, setDeliverBy] = useState(() => toLocalInput(new Date(Date.now() + 7 * 864e5)));
  const [reviewSecs, setReviewSecs] = useState(48 * 3600);
  const [buyer, setBuyer] = useState("");
  const [anyBuyer, setAnyBuyer] = useState(false);
  const [arbiter, setArbiter] = useState("");
  const [created, setCreated] = useState<{ id: bigint; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const token = deployment?.tokens[tokenIdx];
  const amount = parseAmount(amountText, token?.decimals ?? 18);

  const problems = useMemo(() => {
    const p: string[] = [];
    if (!title.trim()) p.push("Give the deal a short title.");
    if (!body.trim()) p.push("Say what will be delivered.");
    if (amount === null) p.push("Enter an amount, for example 120 or 49.50.");
    else if (token) {
      const norm = amount * 10n ** BigInt(18 - token.decimals);
      if (norm < 10n ** 18n || norm > 1000n * 10n ** 18n) p.push("Amount must be between 1 and 1,000.");
    }
    const when = new Date(deliverBy).getTime();
    if (!Number.isFinite(when) || when <= Date.now() + 60_000) p.push("Pick a deadline in the future.");
    else if (when > Date.now() + 180 * 864e5) p.push("The deadline can be at most 180 days away.");
    if (buyer && !isAddress(buyer, { strict: false })) p.push("The buyer address isn't valid.");
    if (arbiter && !isAddress(arbiter, { strict: false })) p.push("The arbiter address isn't valid.");
    if (buyer && arbiter && buyer.toLowerCase() === arbiter.toLowerCase()) p.push("Buyer and arbiter must be different.");
    if (address && buyer.toLowerCase() === address.toLowerCase()) p.push("You can't be your own buyer.");
    return p;
  }, [title, body, amount, token, deliverBy, buyer, arbiter, address]);

  const ready = problems.length === 0 && !!deployment && !!token && amount !== null;

  const txSteps =
    ready && deployment && token && amount !== null
      ? steps.createDeal(deployment.vouch, {
          buyer: (buyer || zeroAddress) as Address,
          token: token.address,
          amount,
          deliverBy: BigInt(Math.floor(new Date(deliverBy).getTime() / 1000)),
          reviewSecs,
          buyerNeedsAgentId: !anyBuyer,
          arbiter: (arbiter || zeroAddress) as Address,
          termsHash: hashTerms({ title, body }),
        })
      : null;

  if (!deployment) return <NotDeployed />;

  if (created) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Card>
          <h1 className="text-2xl font-semibold">Deal #{created.id.toString()} is live</h1>
          <p className="mt-2 text-muted">
            Send this link to your buyer. It carries the terms, so they can read exactly what you
            wrote. Only a fingerprint of the terms is stored on chain.
          </p>
          <input readOnly className={`${inputClass} mt-4 font-mono`} value={created.link} onFocus={(e) => e.currentTarget.select()} />
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(created.link);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Link
              href={created.link.replace(window.location.origin, "")}
              className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 text-sm font-semibold hover:bg-surface-2"
            >
              Open the deal
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Create a deal</h1>
        <p className="mt-2 text-muted">You are the seller. The buyer funds it, you deliver, they approve.</p>
      </div>

      {address && holds === false ? (
        <Notice tone="danger" title="This wallet doesn't hold an Agent ID">
          Only Agent ID holders can post deals. Claim yours in the Binance app (Wallet, Agent ID),
          then come back.
        </Notice>
      ) : null}
      {address && holds ? (
        <Notice tone="accent">
          Posting as <strong>{handle}</strong>.
        </Notice>
      ) : null}

      <Card className="space-y-5">
        <Field label="Title">
          <input className={inputClass} value={title} maxLength={80} placeholder="Logo pack" onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="What you will deliver" hint="Be specific. If there's a disagreement later, this is what everyone points back to.">
          <textarea
            className={`${inputClass} min-h-28 py-3`}
            value={body}
            maxLength={1200}
            placeholder="Three logo options, two rounds of edits, files delivered as a link."
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Amount">
            <input className={`${inputClass} num`} inputMode="decimal" value={amountText} placeholder="120" onChange={(e) => setAmountText(e.target.value)} />
          </Field>
          <Field label="Paid in">
            <select className={inputClass} value={tokenIdx} onChange={(e) => setTokenIdx(Number(e.target.value))}>
              {deployment.tokens.map((t, i) => (
                <option key={t.address} value={i}>
                  {t.symbol}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Deliver by" hint="Your local time.">
            <input type="datetime-local" className={inputClass} value={deliverBy} onChange={(e) => setDeliverBy(e.target.value)} />
          </Field>
          <Field label="Buyer review window" hint="How long the buyer has to approve or object after you deliver.">
            <select className={inputClass} value={reviewSecs} onChange={(e) => setReviewSecs(Number(e.target.value))}>
              {reviewOptions.map((o) => (
                <option key={o.secs} value={o.secs}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <details className="rounded-xl border border-line px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">More options</summary>
          <div className="mt-4 space-y-5">
            <Field label="Specific buyer (optional)" hint="Leave empty to let any eligible buyer fund it.">
              <input className={`${inputClass} font-mono`} value={buyer} placeholder="0x…" spellCheck={false} onChange={(e) => setBuyer(e.target.value.trim())} />
            </Field>
            <Toggle
              checked={anyBuyer}
              onChange={setAnyBuyer}
              label="Let buyers without an Agent ID fund this deal"
              hint="By default the buyer needs an Agent ID too."
            />
            <Field label="Arbiter (optional)" hint="Someone you both trust, who can decide a split if there's a dispute. Without one, the two of you negotiate, and after 7 days it splits 50/50.">
              <input className={`${inputClass} font-mono`} value={arbiter} placeholder="0x…" spellCheck={false} onChange={(e) => setArbiter(e.target.value.trim())} />
            </Field>
          </div>
        </details>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Summary</h2>
        <p className="text-sm text-muted">
          {amount !== null && token ? (
            <>
              The buyer pays <strong className="text-ink">{formatAmount(amount, token.decimals)} {token.symbol}</strong> into escrow. You are
              paid when they approve, or automatically {reviewOptions.find((o) => o.secs === reviewSecs)?.label ?? "later"} after you
              deliver if they say nothing. If you miss the deadline, they get it all back.
            </>
          ) : (
            "Fill in the amount to see the summary."
          )}
        </p>
        {problems.length > 0 && (title || body || amountText) ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-dispute">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        <TxButton
          label="Create deal"
          steps={txSteps ?? []}
          disabled={!ready || holds === false}
          onDone={(receipts) => {
            for (const r of receipts) {
              for (const log of r.logs) {
                try {
                  const ev = decodeEventLog({ abi: vouchAbi, data: log.data, topics: log.topics });
                  if (ev.eventName === "DealCreated") {
                    const id = ev.args.id;
                    const t = encodeTerms({ title, body });
                    try {
                      localStorage.setItem(`vouch:terms:${deployment?.chain.id}:${id}`, t);
                    } catch {
                      // private mode, the link still has the terms
                    }
                    setCreated({ id, link: `${window.location.origin}/d/${id}?t=${t}` });
                    return;
                  }
                } catch {
                  // not one of ours
                }
              }
            }
          }}
        />
        {txSteps ? <AgentDrawer steps={txSteps} /> : null}
      </Card>
    </div>
  );
}
