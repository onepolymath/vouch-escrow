import { formatUnits, parseUnits } from "viem";

export function shortAddress(a: string, head = 6, tail = 4): string {
  return a.length <= head + tail + 2 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;
}

export function formatAmount(value: bigint, decimals = 18, maxFraction = 2): string {
  const s = formatUnits(value, decimals);
  const [whole = "0", frac = ""] = s.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const f = frac.padEnd(maxFraction, "0").slice(0, maxFraction);
  return maxFraction === 0 ? withCommas : `${withCommas}.${f}`;
}

/** returns null for anything that is not a plain positive decimal number */
export function parseAmount(input: string, decimals = 18): bigint | null {
  const t = input.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [, frac = ""] = t.split(".");
  if (frac.length > decimals) return null;
  const v = parseUnits(t, decimals);
  return v > 0n ? v : null;
}

export function formatDuration(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 28 Nov 18:00 UTC */
export function formatUtc(ts: number | bigint): string {
  const d = new Date(Number(ts) * 1000);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
