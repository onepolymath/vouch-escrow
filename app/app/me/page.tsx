"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { AgentDrawer } from "@/components/AgentDrawer";
import { NotDeployed } from "@/components/NotDeployed";
import { TrustCard } from "@/components/TrustCard";
import { TxButton } from "@/components/TxButton";
import { Card, Chip, Field, inputClass, Notice } from "@/components/ui";
import { vouchAbi } from "@/lib/abi";
import { steps } from "@/lib/calls";
import { deployment } from "@/lib/config";
import { availableActions, roleOf, statusLabel, type Deal } from "@/lib/deal";
import { formatAmount, formatDuration } from "@/lib/format";
import { useAgentId, useNow, useTrust } from "@/lib/hooks";
import { hashNote } from "@/lib/terms";

type Tab = "action" | "waiting" | "done";

function DealRow({
  id,
  deal,
  me,
  now,
}: {
  id: bigint;
  deal: Deal;
  me: `0x${string}`;
  now: number;
}) {
  const role = roleOf(deal, me);
  const meta = statusLabel[deal.status];
  const token = deployment?.tokens.find(
    (t) => t.address.toLowerCase() === deal.token.toLowerCase(),
  );
  const actions = availableActions(deal, role, now);
  const left = Number(deal.deliverBy) - now;
  return (
    <li>
      <Link
        href={`/d/${id}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 hover:bg-surface-2"
      >
        <div>
          <p className="font-medium">
            Deal #{id.toString()} <span className="text-muted">· you are the {role}</span>
          </p>
          <p className="num text-sm text-muted">
            {formatAmount(deal.amount)} {token?.symbol ?? ""}
            {deal.status <= 1 && left > 0 ? ` · due in ${formatDuration(left)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {actions.length > 0 && role !== "visitor" ? <Chip tone="accent">Your move</Chip> : null}
          {meta ? <Chip tone={meta.tone}>{meta.label}</Chip> : null}
        </div>
      </Link>
    </li>
  );
}

function Credits({ account }: { account: `0x${string}` }) {
  const tokens = deployment?.tokens ?? [];
  const { data } = useReadContracts({
    contracts: tokens.map((t) => ({
      address: deployment!.vouch,
      abi: vouchAbi,
      functionName: "credit" as const,
      args: [t.address, account] as const,
    })),
    query: { refetchInterval: 15_000 },
  });
  const held = tokens
    .map((t, i) => ({ t, amount: (data?.[i]?.result as bigint | undefined) ?? 0n }))
    .filter((x) => x.amount > 0n);
  if (held.length === 0) return null;
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Money waiting for you</h2>
      <p className="text-sm text-muted">
        A payout couldn&apos;t be sent straight to you when a deal ended, so it was set aside. You
        can collect it here.
      </p>
      {held.map(({ t, amount }) => (
        <div key={t.address} className="space-y-3">
          <p className="num font-medium">
            {formatAmount(amount)} {t.symbol}
          </p>
          <TxButton
            label={`Withdraw ${t.symbol}`}
            steps={steps.withdraw(deployment!.vouch, t.address)}
          />
          <AgentDrawer steps={steps.withdraw(deployment!.vouch, t.address)} />
        </div>
      ))}
    </Card>
  );
}

function Profile({ account }: { account: `0x${string}` }) {
  const [text, setText] = useState("");
  const { data: current } = useReadContract({
    address: deployment!.vouch,
    abi: vouchAbi,
    functionName: "profileOf",
    args: [account],
  });
  const published = !!current && !/^0x0+$/.test(current as string);
  const hash = hashNote(text);
  const txSteps = steps.openProfile(deployment!.vouch, hash);
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Your profile</h2>
        <p className="mt-1 text-sm text-muted">
          A short line about what you offer. Only its fingerprint goes on chain. Share the text
          wherever you advertise, anyone can check it matches.
        </p>
      </div>
      {published ? <Notice tone="accent">Profile published.</Notice> : null}
      <Field label="What you offer">
        <textarea
          className={`${inputClass} min-h-20 py-3`}
          value={text}
          maxLength={400}
          onChange={(e) => setText(e.target.value)}
          placeholder="Logo and brand design for agents and small teams."
        />
      </Field>
      <TxButton
        label={published ? "Update profile" : "Publish profile"}
        steps={txSteps}
        disabled={!text.trim()}
        variant="secondary"
      />
      <AgentDrawer steps={txSteps} />
    </Card>
  );
}

function Mine({ account }: { account: `0x${string}` }) {
  const now = useNow();
  const [tab, setTab] = useState<Tab>("action");
  const { holds, handle } = useAgentId(account);
  const trust = useTrust(account);

  const { data: ids } = useReadContract({
    address: deployment!.vouch,
    abi: vouchAbi,
    functionName: "dealIdsOf",
    args: [account, 0n, 100n],
    query: { refetchInterval: 10_000 },
  });
  const list = ((ids as readonly bigint[] | undefined) ?? []).slice().reverse();
  const { data: deals } = useReadContracts({
    contracts: list.map((id) => ({
      address: deployment!.vouch,
      abi: vouchAbi,
      functionName: "getDeal" as const,
      args: [id] as const,
    })),
    query: { enabled: list.length > 0, refetchInterval: 10_000 },
  });

  const rows = list
    .map((id, i) => ({ id, deal: deals?.[i]?.result as Deal | undefined }))
    .filter((r): r is { id: bigint; deal: Deal } => !!r.deal);

  const bucket = (d: Deal): Tab => {
    if (d.status >= 3 && d.status !== 4) return "done";
    const role = roleOf(d, account);
    return availableActions(d, role, now).length > 0 && role !== "visitor" ? "action" : "waiting";
  };
  const counts = { action: 0, waiting: 0, done: 0 };
  rows.forEach((r) => counts[bucket(r.deal)]++);
  const shown = rows.filter((r) => bucket(r.deal) === tab);

  return (
    <div className="space-y-6">
      {holds === false ? (
        <Notice tone="pending" title="This wallet doesn't hold an Agent ID">
          You can still fund open deals if the seller allows buyers without one. To post deals you
          need an Agent ID, claimed in the Binance app.
        </Notice>
      ) : null}
      {holds && handle ? (
        <p className="text-lg">
          Signed in as <strong>{handle}</strong>
        </p>
      ) : null}

      <Credits account={account} />

      <div className="space-y-3">
        <div role="tablist" aria-label="Deal filter" className="flex flex-wrap gap-2">
          {(
            [
              ["action", "Needs my move"],
              ["waiting", "Waiting on them"],
              ["done", "Finished"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`min-h-10 rounded-full px-4 text-sm font-medium ${
                tab === k ? "bg-ink text-bg" : "bg-surface-2 text-muted hover:text-ink"
              }`}
            >
              {label} <span className="num opacity-70">{counts[k]}</span>
            </button>
          ))}
        </div>
        {shown.length > 0 ? (
          <ul className="space-y-2.5">
            {shown.map((r) => (
              <DealRow key={r.id.toString()} id={r.id} deal={r.deal} me={account} now={now} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            {rows.length === 0 ? (
              <>
                No deals yet.{" "}
                <Link className="underline" href="/deals/new">
                  Create the first one
                </Link>
              </>
            ) : (
              "Nothing in this list."
            )}
          </p>
        )}
      </div>

      {holds ? <Profile account={account} /> : null}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Your record</h2>
        {trust.data ? (
          <TrustCard data={trust.data} />
        ) : (
          <p className="text-sm text-muted">Reading the chain…</p>
        )}
      </div>
    </div>
  );
}

export default function MePage() {
  const { address, isConnected } = useAccount();
  if (!deployment) return <NotDeployed />;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">My deals</h1>
      {isConnected && address ? (
        <Mine account={address} />
      ) : (
        <Notice>
          Connect your wallet to see your deals. If you use an Agentic Wallet, open a deal link
          instead and use &ldquo;Run with your agent&rdquo; on each step.
        </Notice>
      )}
    </div>
  );
}
