# ADR-0005 — No network access, no auto-update, no telemetry
- Status: Accepted
- Date: 2026-10-13

## Context
The owner asked for "nothing remote". Personal financial data is sensitive. Auto-update on Windows works best with signed builds. The [electron-builder code-signing docs](https://www.electron.build/docs/features/code-signing/) and third-party guides found by a search on 2026-10-13 describe signature verification in electron-updater (Medium confidence; not essential to this decision).

## Decision
The app makes no network requests:
- Production builds cancel all `http(s)`/`ws(s)` requests via `session.webRequest.onBeforeRequest`.
- The CSP restricts `connect-src` to `'self'`.

It also has no auto-update (users download new versions from GitHub Releases), no telemetry, no crash upload and no live stock prices. The only outbound action is opening the fixed GitHub repo URL in the system browser when the user clicks it.

## Consequences
Investment values are entered by hand. Users check Releases for updates. The About screen shows the version and a link.

## Alternatives considered
An opt-in update check (small privacy cost; could come later in a superseding ADR); price APIs (keys, terms, network access).

## Reversal cost
Low technically. Any reversal needs a superseding ADR, a README privacy update and a re-check of OPEN-QUESTIONS L1.
