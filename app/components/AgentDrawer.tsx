"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { isAddress, type Address } from "viem";
import { toRawCall, type Step } from "@/lib/calls";
import { bawChecklist, bawExecute, bawPreview } from "@/lib/baw";
import { deployment } from "@/lib/config";
import { Button, Field, inputClass, Notice } from "./ui";

function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

/**
 * For people whose wallet is an Agentic Wallet driven by the `baw` CLI. We do not connect to it
 * and we do not ask for any pairing code. We only show the exact commands for the user's own
 * agent to run, and the user confirms in the Binance app.
 */
export function AgentDrawer({ steps }: { steps: Step[] }) {
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const wallet = (from || address || "") as string;
  const valid = isAddress(wallet, { strict: false });
  const chainId = deployment?.chain.id ?? 56;
  const mainnet = chainId === 56;

  return (
    <div>
      <Button
        variant="ghost"
        className="px-0 text-accent hover:bg-transparent"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? "Hide agent commands" : "Run with your agent"}
      </Button>
      {open ? (
        <div className="mt-3 space-y-4 rounded-xl border border-line bg-surface-2 p-4">
          {!mainnet ? (
            <Notice tone="pending">
              This is the test deployment. Agentic Wallet works on BNB Chain mainnet, so on testnet
              use a normal wallet. The commands below show the shape for mainnet.
            </Notice>
          ) : null}
          <Field
            label="Your Agentic Wallet address"
            hint="The address your agent signs with. It is used only to build the command."
          >
            <input
              className={`${inputClass} font-mono`}
              value={from}
              placeholder={address ?? "0x…"}
              onChange={(e) => setFrom(e.target.value.trim())}
              spellCheck={false}
            />
          </Field>
          {valid ? (
            <ol className="space-y-4">
              {steps.map((s, i) => {
                const call = toRawCall(s);
                const cmd = bawPreview({ chainId, from: wallet as Address, call });
                return (
                  <li key={i}>
                    <p className="mb-1.5 text-sm font-medium">
                      {steps.length > 1 ? `${i + 1}. ` : ""}
                      {s.label}
                    </p>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-bg p-3 font-mono text-xs leading-relaxed">
                      {cmd}
                    </pre>
                    <div className="mt-2 flex gap-2">
                      <Copy text={cmd} label="Copy command" />
                      <Copy text={call.data} label="Copy calldata" />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted">Enter the wallet address to see the commands.</p>
          )}
          <div className="space-y-1.5 text-sm text-muted">
            <p className="font-medium text-ink">Then</p>
            <ol className="list-decimal space-y-1 pl-5">
              {bawChecklist.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ol>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-bg p-3 font-mono text-xs">
              {bawExecute}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
