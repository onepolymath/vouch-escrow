import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto max-w-5xl space-y-2 px-4 py-8 text-xs leading-relaxed text-muted sm:px-6">
        <p>
          Vouch is an independent open-source project. It is not affiliated with or endorsed by
          Binance. Contracts are unaudited, deals are capped, and the code is{" "}
          <a className="underline" href="https://github.com/onepolymath/vouch-escrow">
            on GitHub
          </a>
          .
        </p>
        <p>
          A track record shows past deals on this contract and nothing else. It is not advice and
          not a guarantee about anyone. Only deal with amounts you can afford to lose.{" "}
          <Link className="underline" href="/docs">
            What the contract can and cannot do
          </Link>
          .
        </p>
      </div>
    </footer>
  );
}
