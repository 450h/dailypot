# Architecture Decision Records (ADRs)

Short, immutable records of **why** a significant choice was made. When a decision changes, **don't edit the old ADR. Write a new one that supersedes it** (mark the old one `Superseded by ADR-XXXX`).

## Format
`NNNN-short-title.md` with **Status · Date · Context · Decision · Consequences · Alternatives · Reversal cost**. Keep each under a page.

## Log
| ADR | Title | Status |
|---|---|---|
| [0001](0001-stack-electron-react.md) | Stack: Electron + React + TypeScript (electron-vite, electron-builder) | Accepted |
| [0002](0002-local-json-storage-and-backups.md) | Local JSON storage, atomic writes, snapshots (the data-location/durability decision) | Accepted |
| [0003](0003-money-as-integer-minor-units.md) | Money as integer minor units | Accepted |
| [0004](0004-derived-pot-ledger.md) | The pot is derived from a single timeline, never stored | Accepted |
| [0005](0005-no-network-no-auto-update.md) | No network access, no auto-update, no telemetry | Accepted |
| [0006](0006-license-mit.md) | MIT license | Accepted |
| [0007](0007-anchored-main-balance.md) | Anchored, derived main balance and net worth | Accepted |
