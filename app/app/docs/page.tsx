import type { Metadata } from "next";
import { Card, Mono } from "@/components/ui";
import { deployment, explorerAddress } from "@/lib/config";

export const metadata: Metadata = { title: "How it works" };

const cannot = [
  "Move or freeze anyone's funds. There is no admin function that touches deal money.",
  "Pause the contract, or stop a deal from finishing.",
  "Upgrade or replace the contract. It is not behind a proxy.",
  "Change the supported tokens or the deal limits. Both are fixed when it is deployed.",
  "Take a fee. There is none.",
  "Mint, burn or issue any token of its own.",
  "Pull money from your wallet. It only moves what you approved for one deal, and the app asks for the exact amount, never unlimited.",
];

const rules = [
  [
    "Who can post a deal",
    "A wallet that holds an Agent ID. Checked on chain when the deal is created.",
  ],
  [
    "Who can fund it",
    "Anyone the seller names, or any Agent ID holder if it is open. The seller can allow buyers without an Agent ID.",
  ],
  ["Tokens", "USDT and USDC only, as listed below."],
  ["Deal size", "Between 1 and 1,000 in token units while the contract is unaudited."],
  [
    "Deadline",
    "Must be in the future, at most 180 days away. Miss it and anyone can send the money back to the buyer.",
  ],
  [
    "Review window",
    "1 hour to 14 days, chosen by the seller. If the buyer says nothing, anyone can release the payment after it ends.",
  ],
  [
    "Disputes",
    "The buyer can object inside the window. The two sides then propose splits, and either can accept the other's. An arbiter named at creation can decide instead. After 7 days with no agreement, anyone can trigger an even 50/50 split.",
  ],
  [
    "Blocked payouts",
    "If a token refuses to send to someone (for example a blocklisted address), their share is kept as a balance they can withdraw later. It never blocks the other side.",
  ],
];

export default function Docs() {
  const rows = deployment
    ? [
        ["Vouch", deployment.vouch],
        ["Agent ID registry", deployment.agentId],
        ...deployment.tokens.map((t) => [t.symbol, t.address] as const),
      ]
    : [];
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">How it works</h1>
        <p className="mt-2 text-muted">
          Vouch is a small escrow contract. This page says plainly what it does, and what it can
          never do.
        </p>
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold">What nobody can do, including the author</h2>
        <p className="text-sm text-muted">
          The contract has no owner and no admin. Everything below is true by construction, and you
          can check it in the source.
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          {cannot.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">The rules of a deal</h2>
        <dl className="space-y-3 text-sm">
          {rules.map(([k, v]) => (
            <div key={k}>
              <dt className="font-medium">{k}</dt>
              <dd className="mt-0.5 text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Agent ID, and the track record</h2>
        <p className="text-sm text-muted">
          An Agent ID is a name for a Binance Agentic Wallet. Each person gets one, and it
          can&apos;t be transferred, so a record built under it can&apos;t be bought or passed on.
          The contract checks it by asking the Agent ID registry whether the address holds one. The
          trust check works on addresses, never on names.
        </p>
        <p className="text-sm text-muted">
          The record counts completed deals, volume, disputes and missed deadlines on this contract.
          It does not rate anyone and it can&apos;t see anything that happened elsewhere.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Using an Agentic Wallet</h2>
        <p className="text-sm text-muted">
          Vouch never asks you to scan a QR code or type a pairing code, and it never holds a login
          for your wallet. Instead each step has a &ldquo;Run with your agent&rdquo; section with
          the exact <Mono>baw contract-call preview</Mono> command. Your agent runs it, you read the
          preview, and you confirm in the Binance app. Developer Mode has to be on for contract
          calls.
        </p>
      </Card>

      {deployment ? (
        <Card className="space-y-3">
          <h2 className="font-semibold">Addresses on {deployment.chain.name}</h2>
          {deployment.mockRegistry ? (
            <p className="text-sm text-pending">
              This is the test deployment. The registry and tokens below are test stand-ins, not the
              real Agent ID contract or real stablecoins.
            </p>
          ) : null}
          <dl className="space-y-2.5 text-sm">
            {rows.map(([name, addr]) => {
              const link = explorerAddress(addr);
              return (
                <div key={name} className="flex flex-wrap justify-between gap-x-4">
                  <dt className="font-medium">{name}</dt>
                  <dd className="break-all">
                    {link ? (
                      <a className="underline" href={link} target="_blank" rel="noreferrer">
                        <Mono>{addr}</Mono>
                      </a>
                    ) : (
                      <Mono>{addr}</Mono>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Card>
      ) : null}

      <Card className="space-y-2">
        <h2 className="font-semibold">Risks, in plain words</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>
            The contract is open source but has not been audited. That is why deals are capped.
          </li>
          <li>Stablecoins can be frozen by their issuers. Vouch cannot undo that.</li>
          <li>
            The Agent ID registry has its own owner, outside our control. Vouch trusts what it says
            about holders.
          </li>
          <li>
            A record is only as good as the deals behind it. Small, friendly deals look the same as
            big ones.
          </li>
          <li>Nothing here is financial advice and nothing here promises any return.</li>
        </ul>
      </Card>
    </div>
  );
}
