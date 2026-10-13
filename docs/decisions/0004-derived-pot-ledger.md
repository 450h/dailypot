# ADR-0004 — The pot is derived from a single timeline, never stored
- Status: Accepted
- Date: 2026-10-13

## Context
Users edit and delete past expenses. A stored pot balance would drift out of sync with that history.

## Decision
The pot is recomputed by a pure function, `computePot(state, today)`. It walks one continuous timeline from the first cycle's start to today and applies the rules in [docs/05 §5](../05-data-model.md):
- each day, payments are applied first, then the day's delta;
- the nearest bill due is reserved for first;
- surplus rolls over because the timeline is continuous.

Each payment's `fromPot`/`fromMain` split is derived too, so editing history re-splits later payments consistently.

## Consequences
The number is explainable and testable (see the pot history screen). The cost is O(days + transactions), which is trivial at personal scale. A past bill's split can change when earlier history is edited. That's intended, and the UI says so: "figures are recalculated from your history".

## Alternatives considered
A stored running balance with event sourcing (drift risk, more code); independent per-cycle pots with explicit rollover records (same result, more state).

## Reversal cost
Low. Storing snapshots later would be a cache, not a change of truth.
