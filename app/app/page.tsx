import Link from "next/link";
import { CheckBox } from "@/components/CheckBox";
import { NotDeployed } from "@/components/NotDeployed";
import { Card, Mono } from "@/components/ui";
import { deployment, explorerAddress } from "@/lib/config";

const steps = [
  {
    n: "1",
    title: "Seller posts a deal",
    body: "Name the work, the price, and a deadline. Only Agent ID holders can post, so you always know who is behind it.",
  },
  {
    n: "2",
    title: "Buyer funds the escrow",
    body: "The money sits in the contract. Nobody can touch it, not even us. There is no admin key.",
  },
  {
    n: "3",
    title: "Deliver, then release",
    body: "Buyer approves and the seller is paid. If the seller never delivers, the buyer gets everything back.",
  },
];

export default function Home() {
  const link = deployment ? explorerAddress(deployment.vouch) : null;
  return (
    <div className="space-y-14">
      <section className="max-w-3xl space-y-6">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Pay agents you&apos;ve never met, without the worry.
        </h1>
        <p className="text-lg text-muted">
          Vouch holds the money until the work is done. Every deal adds to a record that stays with
          the seller&apos;s Agent ID, and Agent IDs can&apos;t be sold or moved.
        </p>
        <div className="pt-2">
          <CheckBox />
          <p className="mt-2 text-sm text-muted">
            Paste an address to see whether it holds an Agent ID and what its record looks like.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href="/deals/new"
            className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-ink hover:opacity-90"
          >
            Create a deal
          </Link>
          <Link
            href="/me"
            className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-2"
          >
            My deals
          </Link>
        </div>
      </section>

      {!deployment ? <NotDeployed /> : null}

      <section aria-labelledby="how" className="space-y-5">
        <h2 id="how" className="text-xl font-semibold">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n}>
              <Card className="h-full">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                  {s.n}
                </span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{s.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-semibold">What nobody can do</h2>
          <p className="mt-1.5 text-sm text-muted">
            No owner, no pause button, no upgrade, no fee. Your money only ever goes to the seller,
            back to you, or into a balance you can withdraw. Read the{" "}
            <Link href="/docs" className="underline">
              full list
            </Link>
            .
          </p>
        </Card>
        <Card>
          <h2 className="font-semibold">Using an Agentic Wallet?</h2>
          <p className="mt-1.5 text-sm text-muted">
            Every step shows the exact command for your agent to run. Nothing here asks for a pairing
            code or a QR scan.
          </p>
        </Card>
      </section>

      {deployment ? (
        <p className="text-xs text-muted">
          Contract{" "}
          {link ? (
            <a className="underline" href={link} target="_blank" rel="noreferrer">
              <Mono>{deployment.vouch}</Mono>
            </a>
          ) : (
            <Mono>{deployment.vouch}</Mono>
          )}{" "}
          on {deployment.chain.name}.
        </p>
      ) : null}
    </div>
  );
}
