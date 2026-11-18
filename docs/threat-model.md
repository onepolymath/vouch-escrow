# Threat model

Short and honest. This is what Vouch protects, what it trusts, and where it is weak.

## What is at stake

Stablecoins that sit in the contract between funding and payout, and the track record attached to
each address. Deals are capped at 1,000 USDT or USDC while the code is unaudited.

## What the contract trusts

| Thing | Why it matters | If it goes wrong |
| --- | --- | --- |
| Agent ID registry (`0x60B9…022F`) | Decides who counts as a holder. It has its own owner. | A bad registry could say anyone is a holder, or nobody is. Funds in existing deals are unaffected, only who can open new ones. |
| USDT and USDC | The only tokens accepted. | An issuer can freeze an address or pause the token. Vouch can't undo that. |
| Block timestamps | Deadlines and review windows. | Validators can nudge timestamps by seconds. Windows are measured in hours and days, so that doesn't matter. |

There is nothing else to trust. In particular there is no owner key, no oracle, no off-chain signer
and no upgrade path.

## What each party can try

| Who | Attack | What stops it |
| --- | --- | --- |
| Seller | Take the money and not deliver | Funds sit in the contract. Past the deadline anyone can refund the buyer. |
| Seller | Mark delivered with an empty promise | The buyer can object inside the review window. |
| Buyer | Receive the work, then refuse to pay | After the window, anyone can release the payment. Objecting needs the buyer to open a dispute, which shows on their record. |
| Buyer | Dispute everything | Disputes are counted on both records. The even split after 7 days means stalling costs half the money. |
| Anyone | Re-enter during a payout | All payout functions are `nonReentrant`, and state is updated before tokens move. |
| Anyone | Block a payout by using a blocklisted address | A failed transfer is recorded as a credit for that address. The other side is paid in full and the credit can be withdrawn later. |
| Anyone | Grief by sending tokens straight to the contract | Accounting is per deal, so stray tokens don't change anything. They are not recoverable. |
| Arbiter | Collude with one side | The arbiter is named at creation and both parties see it before funding. Don't accept an arbiter you don't trust, or don't name one. |

## Known limits

- Fee-on-transfer and rebasing tokens aren't supported. The allowlist only holds plain USDT and USDC.
- Handles are not looked up. The contract only checks addresses, and the app's trust check takes
  addresses only. If a user types a name, the app says so and asks for an address.
- The terms text isn't on chain, only its hash. The seller's link carries the text.
- A new address has an empty record. Empty doesn't mean bad, it means unknown.
- Nothing here has been audited. Please read the code and report problems, see `SECURITY.md`.

## What was tested

Unit tests for every function and revert, fuzz tests for amounts, windows and split ratios,
invariant tests across random sequences of actions, and fork tests against the real registry and
USDT on BSC. A deliberately broken payout calculation was caught by the invariants.
