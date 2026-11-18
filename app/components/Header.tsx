"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "./ConnectButton";
import { deployment, isTestnet } from "@/lib/config";
import { Chip } from "./ui";

const links = [
  { href: "/check", label: "Check" },
  { href: "/deals/new", label: "Create deal" },
  { href: "/me", label: "My deals" },
  { href: "/docs", label: "How it works" },
];

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <rect width="26" height="26" rx="7" fill="var(--accent)" />
      <path
        d="M7.5 13.5l3.7 3.7 7.3-8"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Header() {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <Logo />
          Vouch
        </Link>
        <nav
          aria-label="Main"
          className="order-3 flex w-full flex-wrap gap-1 sm:order-none sm:w-auto"
        >
          {links.map((l) => {
            const active = path === l.href || (l.href !== "/" && path.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {deployment && isTestnet ? <Chip tone="pending">{deployment.chain.name}</Chip> : null}
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
