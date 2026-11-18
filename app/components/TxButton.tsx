"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import type { TransactionReceipt } from "viem";
import type { Step } from "@/lib/calls";
import { deployment, explorerTx } from "@/lib/config";
import { explainError } from "@/lib/errors";
import { Button, Notice } from "./ui";

type Props = {
  steps: Step[];
  label: string;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  onDone?: (receipts: TransactionReceipt[]) => void;
};

/**
 * Sends one or more transactions in order and waits for each. Handles the boring parts:
 * not connected, wrong network, rejected in wallet, and readable revert reasons.
 */
export function TxButton({ steps, label, disabled, variant = "primary", onDone }: Props) {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<{ at: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastHash, setLastHash] = useState<string | null>(null);

  const target = deployment?.chain;

  async function run() {
    if (!client) return;
    setError(null);
    setLastHash(null);
    const receipts: TransactionReceipt[] = [];
    try {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i]!;
        setPhase({ at: i + 1, label: s.label });
        // simulate first so a revert shows up as a readable reason, not a wallet gas error
        const { request } = await client.simulateContract({
          account: address,
          address: s.address,
          abi: s.abi,
          functionName: s.functionName,
          args: s.args,
        } as never);
        const hash = await writeContractAsync(request as never);
        setLastHash(hash);
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("The transaction failed on chain.");
        receipts.push(receipt);
      }
      await qc.invalidateQueries();
      onDone?.(receipts);
    } catch (e) {
      setError(explainError(e));
    } finally {
      setPhase(null);
    }
  }

  if (!isConnected) {
    return (
      <p className="text-sm text-muted">
        Connect a wallet to do this here, or use “Run with your agent”.
      </p>
    );
  }
  if (target && chainId !== target.id) {
    return (
      <Button
        variant="secondary"
        disabled={switching}
        onClick={() => switchChain({ chainId: target.id })}
      >
        Switch to {target.name}
      </Button>
    );
  }

  const busy = phase !== null;
  const link = lastHash ? explorerTx(lastHash) : null;
  return (
    <div className="space-y-3">
      <Button variant={variant} disabled={disabled || busy} onClick={run}>
        {busy
          ? `${phase.label}${steps.length > 1 ? ` (${phase.at} of ${steps.length})` : ""}…`
          : label}
      </Button>
      {busy ? (
        <p className="text-xs text-muted">Confirm in your wallet, then wait a few seconds.</p>
      ) : null}
      {link && !busy ? (
        <p className="text-xs text-muted">
          Sent.{" "}
          <a className="underline" href={link} target="_blank" rel="noreferrer">
            View transaction
          </a>
        </p>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
