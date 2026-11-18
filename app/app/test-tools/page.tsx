"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { NotDeployed } from "@/components/NotDeployed";
import { TxButton } from "@/components/TxButton";
import { Card, Field, inputClass, Notice } from "@/components/ui";
import { mockAgentIdAbi, mockUsdAbi } from "@/lib/abi";
import type { Step } from "@/lib/calls";
import { deployment } from "@/lib/config";
import { useAgentId } from "@/lib/hooks";

/** Only useful on the test deployment, where the Agent ID registry is our own stand-in. */
export default function TestTools() {
  const { address } = useAccount();
  const { holds, handle } = useAgentId(address);
  const [name, setName] = useState("");

  if (!deployment) return <NotDeployed />;
  if (!deployment.mockRegistry) {
    return (
      <Notice title="Nothing to see here">
        These tools only exist on the test deployment. On the real network, Agent IDs are claimed in
        the Binance app.
      </Notice>
    );
  }

  const valid = /^[a-z0-9]{3,20}$/.test(name);
  const claim: Step[] = [
    {
      label: "Claim a test Agent ID",
      address: deployment.agentId,
      abi: mockAgentIdAbi,
      functionName: "claim",
      args: [name],
    },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Test tools</h1>
        <p className="mt-2 text-muted">
          This is a test deployment. Here you can give your wallet a pretend Agent ID and some
          pretend stablecoins so you can try the whole flow. None of it is real money.
        </p>
      </div>

      <Card className="space-y-4">
        <h2 className="font-semibold">1. A test Agent ID</h2>
        {holds ? (
          <Notice tone="accent">
            Your wallet already has the test Agent ID <strong>{handle}</strong>.
          </Notice>
        ) : (
          <>
            <Field label="Pick a handle" hint="3 to 20 characters, lowercase letters and digits.">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value.trim())}
                placeholder="yourname"
              />
            </Field>
            <TxButton label="Claim test Agent ID" steps={claim} disabled={!valid} />
          </>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">2. Test stablecoins</h2>
        <p className="text-sm text-muted">Each tap gives you 1,000.</p>
        <div className="flex flex-wrap gap-3">
          {deployment.tokens.map((t) => (
            <TxButton
              key={t.address}
              variant="secondary"
              label={`Get 1,000 ${t.symbol}`}
              steps={[
                {
                  label: `Mint ${t.symbol}`,
                  address: t.address,
                  abi: mockUsdAbi,
                  functionName: "faucet",
                  args: [],
                },
              ]}
            />
          ))}
        </div>
        <p className="text-sm text-muted">
          You also need a little test BNB for gas. The official BNB Chain testnet faucet gives it
          away for free.
        </p>
      </Card>
    </div>
  );
}
