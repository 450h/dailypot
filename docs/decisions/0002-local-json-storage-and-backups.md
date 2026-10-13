# ADR-0002 — Local JSON storage with atomic writes and snapshots
- Status: Accepted
- Date: 2026-10-13

## Context
All data must stay on the user's PC (no server). The expected volume is small: ~10 transactions/day ≈ 3,650/year, well under 1 MB/year as JSON. Losing someone's financial history is the worst failure. Native SQLite modules (e.g. better-sqlite3) need a rebuild for each Electron ABI, which adds build fragility for a solo maintainer.

## Decision
- A single `data.json` in `app.getPath('userData')` (`%APPDATA%/DailyPot`), loaded fully into memory in the main process. The main process is the only writer.
- **Single instance:** `app.requestSingleInstanceLock()`. Two processes holding separate in-memory copies would silently overwrite each other. This also covers running the portable and installed builds at once, since both share `%APPDATA%/DailyPot`.
- **Atomic writes:** write `data.json.tmp`, `fsync`, then rename it over `data.json`. Retry the rename with backoff (about 5 tries over about 1 s) on Windows `EPERM`/`EBUSY` from antivirus or the indexer.
- **Snapshots:** before the first write of each local day, copy the existing `data.json` to `backups/data-YYYY-MM-DD.json` and keep the newest 14. Write `pre-import-*`, `pre-restore-*` and `pre-migration-*` backups (`<ts>` = `YYYYMMDDTHHmmss`) before destructive operations. These are kept until deleted manually.
- **Corruption fallback:** if `data.json` fails to parse or validate, rename it to `data.corrupt-<ts>.json`, load the newest valid snapshot and show a banner. If no snapshot is valid, show a recovery screen. Never start a silent fresh setup (docs/05 §9).
- `schemaVersion` with forward-only migrations. A file with a newer schema is opened read-only.
- User-driven export/import (JSON) to any location for off-machine copies.

## Consequences
No native modules. The data is simple to inspect and back up. Rewriting the full file on each change is fine at this size; benchmark if a file ever exceeds ~20 MB.

## Alternatives considered
SQLite (native rebuilds); sql.js/WASM SQLite (more complexity, same full-file persistence); IndexedDB in the renderer (puts data in the less-trusted process and is harder to back up).

## Reversal cost
Low to medium: a migration could move the JSON into SQLite later, with schemaVersion as the bridge.
