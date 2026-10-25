# ADR-0007 — Anchored, derived main balance and net worth
- Status: Accepted
- Date: 2026-10-25

## Context
The dashboard showed only the pot, so the owner couldn't see the one number a personal finance app is expected to show: the live main balance ("total balance does not show"). The data model records flows (income, spending, bills, goal contributions, holding buys and sells) but no account balance, and v1 files hold real data, so the change has to be additive and backwards-compatible. Asking for an opening balance at some past date is unreliable; what a user actually knows is their balance *right now*.

## Decision
Add one optional record, `settings.balanceAnchor = { date, amount }`, meaning "at the start of `date` my main balance was `amount`", and **derive** the main balance as `anchor.amount + income − daily − nonDaily − paid bills − goal contributions − net investment buys` over `[anchor.date, today]` ([docs/05 §10](../05-data-model.md)). Without an anchor the window starts at the first cycle and the figure is labelled as the change since tracking started. The UI sets the anchor from "my balance now is X" by backing out today's flows (`anchorForBalanceNow`), so the shown figure matches immediately. **Net worth** = main balance + savings in non-archived goals + the portfolio value of non-archived holdings.

Like the pot (ADR-0004), nothing derived is stored: editing or deleting past entries changes the balance consistently. The schema bump (1 → 2) is an identity migration because the field is optional.

## Consequences
- A live balance, a balance history series and a net worth figure for the dashboard, from data the app already has plus one number the user types once.
- Goals and investments are treated as **cash leaving the main balance**: moving money to a goal or a holding lowers the main balance but not net worth; withdrawing or selling moves it back. Users who keep goal money inside their main account will see "cash" lower than their bank statement; the balance card says so.
- **Archiving a goal or holding means it is closed.** Its money stops counting in net worth (the figure drops by the saved amount or portfolio value) while the contributions and buys remain cash that left the main balance. This matches the Investments page's "Archived (hidden from totals)"; the archive confirmation says what happens to net worth.
- Cash movements the app doesn't model (transfers, refunds outside the categories, fees) make the derived balance drift. The remedy is re-anchoring with a one-step "my balance now is X", not editing history. Each re-anchor shortens the window, so history before the anchor no longer affects the figure.
- A skipped bill is not a cash flow. A bill's `fromMain` split stays informational, since the whole payment leaves the main balance either way.

## Alternatives considered
- **Per-account ledger** (accounts, transfers, every entry tagged with an account): the correct general model, but it multiplies the entry forms, the schema and the migration for a single-user app whose premise is one allowance and one pot. Deferred; the anchor would become that ledger's opening balance.
- **Stored running balance** updated on every write: drifts the moment a past entry is edited (the reason the pot is derived, ADR-0004) and needs repair code.
- **Flows only, no anchor:** shows only a change figure, which doesn't answer "what's my balance?".

## Reversal cost
Low. The anchor is one optional field; a later account ledger can read it as the main account's opening balance, and dropping it is a one-line migration.
