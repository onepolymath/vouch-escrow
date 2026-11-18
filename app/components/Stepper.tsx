import { stepLabels, stepper } from "@/lib/deal";

export function Stepper({ status }: { status: number }) {
  const { current, ended, problem } = stepper(status);
  return (
    <ol className="flex items-center" aria-label="Deal progress">
      {stepLabels.map((label, i) => {
        const done = i < current || (ended && !problem && i <= current);
        const here = i === current && !done;
        const bad = problem && i === current;
        const circle = bad
          ? "border-dispute bg-dispute-soft text-dispute"
          : done
            ? "border-accent bg-accent text-accent-ink"
            : here
              ? "border-accent text-accent"
              : "border-line text-muted";
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                aria-current={here || bad ? "step" : undefined}
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold ${circle}`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`hidden text-sm font-medium sm:inline ${done || here || bad ? "" : "text-muted"}`}>
                {label}
              </span>
            </div>
            {i < stepLabels.length - 1 ? (
              <span className={`mx-3 h-0.5 flex-1 rounded ${i < current ? "bg-accent" : "bg-line"}`} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
