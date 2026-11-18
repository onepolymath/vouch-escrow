"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseInput } from "@/lib/parse-input";
import { Button, inputClass, Notice } from "./ui";

export function CheckBox({ initial = "", compact = false }: { initial?: string; compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);

  function go() {
    const parsed = parseInput(value);
    if (parsed.kind === "invalid") {
      setProblem("That doesn't look like an address (0x…) or a Vouch deal link.");
      return;
    }
    setProblem(null);
    router.push(`/check?q=${encodeURIComponent(value.trim())}`);
  }

  return (
    <div>
      <div className={`flex gap-2 ${compact ? "" : "flex-col sm:flex-row"}`}>
        <input
          aria-label="Wallet address or deal link"
          className={`${inputClass} font-mono`}
          placeholder="Paste a wallet address or a deal link"
          value={value}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
        />
        <Button onClick={go} className="sm:min-w-32">
          Check
        </Button>
      </div>
      {problem ? (
        <div className="mt-3">
          <Notice tone="danger">{problem}</Notice>
        </div>
      ) : null}
    </div>
  );
}
