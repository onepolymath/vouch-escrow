"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useAgentId } from "@/lib/hooks";
import { shortAddress } from "@/lib/format";
import { Button } from "./ui";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { handle } = useAgentId(address);
  const [open, setOpen] = useState(false);

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium">
          {handle ? <span>{handle}</span> : <span className="font-mono text-xs">{shortAddress(address)}</span>}
        </span>
        <Button variant="ghost" className="min-h-9 px-3" onClick={() => disconnect()}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Connect wallet
      </Button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-line bg-surface p-3 shadow-card">
          <p className="mb-2 px-1 text-xs text-muted">
            Use a wallet that holds your Agent ID. Using an Agentic Wallet? Skip this and use “Run
            with your agent” on any step.
          </p>
          <ul className="space-y-1">
            {connectors.map((c) => (
              <li key={c.uid}>
                <button
                  className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
                  disabled={isPending}
                  onClick={() => {
                    connect({ connector: c });
                    setOpen(false);
                  }}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
          {error ? <p className="mt-2 px-1 text-xs text-danger">{error.message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
