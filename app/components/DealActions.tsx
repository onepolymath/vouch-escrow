"use client";

import { useState } from "react";
import { AgentDrawer } from "./AgentDrawer";
import { TxButton } from "./TxButton";
import { Card, Field, inputClass, Notice } from "./ui";
import { steps as build, type Step } from "@/lib/calls";
import { deployment } from "@/lib/config";
import { DISPUTE_TIMEOUT_SECS, type ActionKey, type Deal, type Role } from "@/lib/deal";
import { formatAmount, formatDuration, formatUtc } from "@/lib/format";
import { hashNote } from "@/lib/terms";

type Props = {
  id: bigint;
  deal: Deal;
  role: Role;
  actions: ActionKey[];
  now: number;
  symbol: string;
};

function Action({
  title,
  body,
  children,
  txLabel,
  txSteps,
  disabled,
  variant,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
  txLabel: string;
  txSteps: Step[];
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted">{body}</p>
      </div>
      {children}
      <TxButton label={txLabel} steps={txSteps} disabled={disabled} variant={variant} />
      <AgentDrawer steps={txSteps} />
    </Card>
  );
}

export function DealActions({ id, deal, role, actions, now, symbol }: Props) {
  const vouch = deployment!.vouch;
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [splitPct, setSplitPct] = useState(50);

  const sellerAmt = (deal.amount * BigInt(splitPct)) / 100n;
  const buyerAmt = deal.amount - sellerAmt;
  const money = (v: bigint) => `${formatAmount(v)} ${symbol}`;

  const has = (k: ActionKey) => actions.includes(k);

  if (actions.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">What you can do now</h2>

      {has("fund") && (
        <Action
          title="Fund this deal"
          body={`${money(deal.amount)} goes into escrow. It stays there until you approve, or until the seller misses the deadline and you take it back. You approve exactly this amount, nothing more.`}
          txLabel={`Fund ${money(deal.amount)}`}
          txSteps={build.fund(vouch, id, deal.token, deal.amount)}
        />
      )}

      {has("cancel") && (
        <Action
          title="Cancel this deal"
          body="Nobody has funded it yet, so cancelling costs nothing but gas."
          txLabel="Cancel deal"
          variant="secondary"
          txSteps={build.cancel(vouch, id)}
        />
      )}

      {has("markDelivered") && (
        <Action
          title="Mark as delivered"
          body={`Tell the buyer the work is done. They then have ${formatDuration(deal.reviewSecs)} to approve or object. If they say nothing, you are paid automatically after that.`}
          txLabel="Mark as delivered"
          disabled={!note.trim()}
          txSteps={build.markDelivered(vouch, id, hashNote(note))}
        >
          <Field
            label="Delivery note"
            hint="A link or a short message. Only its fingerprint goes on chain, so send the note itself to the buyer too."
          >
            <textarea
              className={`${inputClass} min-h-24 py-3`}
              value={note}
              maxLength={1200}
              onChange={(e) => setNote(e.target.value)}
              placeholder="https://… files are here"
            />
          </Field>
        </Action>
      )}

      {has("approve") && (
        <Action
          title="Approve and pay"
          body={`Happy with it? ${money(deal.amount)} is released to the seller right away.`}
          txLabel="Approve and pay the seller"
          txSteps={build.approve(vouch, id)}
        />
      )}

      {has("dispute") && (
        <Action
          title="Something's wrong"
          body="Open a dispute inside the review window. The money stays locked while you and the seller agree on a split."
          txLabel="Open a dispute"
          variant="danger"
          disabled={!evidence.trim()}
          txSteps={build.dispute(vouch, id, hashNote(evidence))}
        >
          <Field
            label="What's wrong"
            hint="Only its fingerprint goes on chain. Send the text to the seller as well."
          >
            <textarea
              className={`${inputClass} min-h-24 py-3`}
              value={evidence}
              maxLength={1200}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="Two of the three logos were missing."
            />
          </Field>
        </Action>
      )}

      {has("releaseAfterWindow") && (
        <Action
          title="Release the payment"
          body="The review window is over and nobody objected. Anyone can now send the money to the seller."
          txLabel="Release to seller"
          variant="secondary"
          txSteps={build.releaseAfterWindow(vouch, id)}
        />
      )}

      {has("refundExpired") && (
        <Action
          title="Refund the buyer"
          body="The deadline passed without a delivery. Anyone can now send the money back to the buyer."
          txLabel="Refund the buyer"
          variant="secondary"
          txSteps={build.refundExpired(vouch, id)}
        />
      )}

      {has("acceptSplit") && (
        <Action
          title="Accept the proposed split"
          body={`The other side proposed ${deal.proposedSellerBps / 100}% to the seller and ${100 - deal.proposedSellerBps / 100}% to the buyer. Accepting settles the deal now.`}
          txLabel="Accept and settle"
          txSteps={build.acceptSplit(vouch, id)}
        />
      )}

      {has("proposeSplit") && (
        <Action
          title="Propose a split"
          body="Say how the money should be shared. The other side can accept it, or answer with their own. A newer proposal replaces the old one."
          txLabel={`Propose ${splitPct}% to the seller`}
          variant="secondary"
          txSteps={build.proposeSplit(vouch, id, splitPct * 100)}
        >
          <div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={splitPct}
              aria-label="Seller's share"
              className="w-full accent-[var(--accent)]"
              onChange={(e) => setSplitPct(Number(e.target.value))}
            />
            <div className="num mt-2 flex justify-between text-sm">
              <span>Seller {money(sellerAmt)}</span>
              <span>Buyer {money(buyerAmt)}</span>
            </div>
          </div>
        </Action>
      )}

      {has("arbiterResolve") && (
        <Action
          title="Decide the split"
          body="You were named as the arbiter. Your decision is final and settles the deal."
          txLabel={`Decide: ${splitPct}% to the seller`}
          txSteps={build.arbiterResolve(vouch, id, splitPct * 100)}
        >
          <div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={splitPct}
              aria-label="Seller's share"
              className="w-full accent-[var(--accent)]"
              onChange={(e) => setSplitPct(Number(e.target.value))}
            />
            <div className="num mt-2 flex justify-between text-sm">
              <span>Seller {money(sellerAmt)}</span>
              <span>Buyer {money(buyerAmt)}</span>
            </div>
          </div>
        </Action>
      )}

      {has("settleAfterTimeout") && (
        <Action
          title="Settle with an even split"
          body="Nobody agreed within 7 days. Anyone can now split the money 50/50 and close the deal."
          txLabel="Settle 50/50"
          variant="secondary"
          txSteps={build.settleAfterTimeout(vouch, id)}
        />
      )}

      {role === "visitor" &&
      deal.status === 4 &&
      now <= Number(deal.disputedAt) + DISPUTE_TIMEOUT_SECS ? (
        <Notice>
          The parties have until {formatUtc(Number(deal.disputedAt) + DISPUTE_TIMEOUT_SECS)} to
          agree on a split.
        </Notice>
      ) : null}
    </div>
  );
}
