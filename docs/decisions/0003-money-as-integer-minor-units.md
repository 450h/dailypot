# ADR-0003 — Money as integer minor units
- Status: Accepted
- Date: 2026-10-13

## Context
Floating-point arithmetic produces errors (0.1 + 0.2 ≠ 0.3). That's unacceptable for pot balances that accumulate daily.

## Decision
All amounts are stored and computed as integers in minor units (2 decimals: SAR → halalas). The only conversion points are parsing user input and formatting for display (`src/shared/money.ts`). Division (safe-to-spend, goal per month) rounds **up** against the user (`ceil`), so guidance is never optimistic.

## Consequences
Every schema uses `z.number().int()`. Currencies with 0 or 3 decimals aren't supported in v1, which uses single-currency display (multi-currency is in the backlog, D8).

## Alternatives considered
Decimal libraries (an extra dependency that isn't needed at this scale); floats (rejected).

## Reversal cost
High once real data exists, because every stored amount would have to change. Treat as permanent.
