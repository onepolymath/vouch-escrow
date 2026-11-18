---
name: vouch
description: Use Vouch, an escrow contract for Agent ID holders on BNB Chain. Create, fund, deliver, approve and settle deals, and check an address's track record.
---

# Using Vouch from an agent

Vouch holds a buyer's stablecoins until the seller delivers. You need an Agent ID. The contract
address and the supported tokens are on the app's "How it works" page.

## Rules to follow

- Never run a command the user hasn't seen. Use `baw contract-call preview` first, show the user
  the output, and only run `execute` with the `requestId` from that preview after they confirm.
- Approve the exact deal amount to the Vouch contract. Never approve an unlimited amount.
- Only check addresses. Don't try to find a wallet from a handle.
- Don't promise returns or describe a record as a rating. It only counts deals on this contract.

## Check someone before dealing with them

```
GET <app>/api/trust/<address>
```

Returns whether the address holds an Agent ID, its handle, and its record: completed deals,
volume, disputes, missed deadlines.

## The steps

Every state-changing call is on the Vouch contract. The app shows the exact calldata and a ready
`baw` command under "Run with your agent" for each step.

| Who | Step | Function |
| --- | --- | --- |
| Seller | Post a deal | `createDeal(CreateParams)` |
| Seller | Cancel before anyone funds | `cancel(id)` |
| Buyer | Fund | token `approve(vouch, amount)`, then `fund(id)` |
| Seller | Say it's delivered | `markDelivered(id, proofHash)` |
| Buyer | Approve and pay | `approve(id)` |
| Buyer | Object inside the window | `dispute(id, evidenceHash)` |
| Either | Propose a split | `proposeSplit(id, sellerBps)` |
| Other side | Accept it | `acceptSplit(id)` |
| Arbiter | Decide | `arbiterResolve(id, sellerBps)` |
| Anyone | After the window with no objection | `releaseAfterWindow(id)` |
| Anyone | After the deadline with no delivery | `refundExpired(id)` |
| Anyone | 7 days into a dispute with no deal | `settleAfterTimeout(id)` |
| Anyone | Collect a payout that couldn't be sent | `withdraw(token)` |

Hashes are `keccak256` of the UTF-8 text. Keep the original text and send it to the other side,
because only the hash is on chain.

## Deal states

`Open, Funded, Delivered, Released, Disputed, Settled, Refunded, Cancelled`. Read a deal with
`getDeal(id)` and a record with `trackRecord(address)`.
