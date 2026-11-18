import type { TrustData } from "@/lib/trust";
import { formatAmount, formatUtc } from "@/lib/format";
import { Chip, Card, Mono } from "./ui";
import { explorerAddress } from "@/lib/config";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-0.5 text-xl font-semibold">{value}</dd>
    </div>
  );
}

export function TrustCard({ data }: { data: TrustData }) {
  const r = data.record;
  const kept = r.completedAsSeller + r.completedAsBuyer;
  const link = explorerAddress(data.address);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Holds an Agent ID</p>
          <p className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            {data.holdsAgentId ? "Yes" : "No"}
            {data.handle ? <span className="text-muted">·</span> : null}
            {data.handle ? <span>{data.handle}</span> : null}
          </p>
        </div>
        <Chip tone={data.holdsAgentId ? "accent" : "danger"}>
          {data.holdsAgentId ? "Identified" : "Not identified"}
        </Chip>
      </div>

      <p className="mt-2 break-all">
        {link ? (
          <a className="underline-offset-2 hover:underline" href={link} target="_blank" rel="noreferrer">
            <Mono className="text-muted">{data.address}</Mono>
          </a>
        ) : (
          <Mono className="text-muted">{data.address}</Mono>
        )}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-5 border-t border-line pt-5 sm:grid-cols-4">
        <Stat label="Deals completed" value={kept} />
        <Stat label="Volume" value={formatAmount(BigInt(r.volume), 18, 0)} />
        <Stat label="Disputes involved" value={r.disputesAgainst + r.disputesOpened} />
        <Stat label="Missed deadlines" value={r.missedDeadlines} />
      </dl>

      <p className="mt-5 text-sm text-muted">
        {r.since
          ? `First seen on Vouch ${formatUtc(r.since)}. ${data.dealCount} ${data.dealCount === 1 ? "deal" : "deals"} in total.`
          : "No history on Vouch yet. That says nothing good or bad, it just means there is nothing to show."}
      </p>
      <p className="mt-2 text-xs text-muted">
        This only covers deals made through this contract. It is a record, not a rating, and not
        advice.
      </p>
    </Card>
  );
}
