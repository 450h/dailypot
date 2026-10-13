# 08 — Roadmap, testing & risks

**Who builds what:**
- **Claude Code** builds the phases in-session.
- A **QA agent** reviews the docs and every phase against the acceptance criteria below. The build doesn't advance while QA has open blocking findings.
- **The owner** reviews the finished app, does the restore drill, and does the releases and pushes.

Owner time per phase covers review and testing. The owner's weekly hours weren't captured at intake (D10). Ongoing maintenance is assumed to be ≤ 1 h/week.

Every phase leaves the app runnable (`npm run dev`) with tests green.

| Phase | Scope | QA acceptance criteria | Owner review time (best / likely / worst) |
|---|---|---|---|
| **P0 — Scaffold** | electron-vite + React + TS strict; ESLint; Vitest; folder structure; hardened BrowserWindow; single-instance lock; preload bridge; `.github/workflows/ci.yml`, `release.yml`, `dependabot.yml` | `npm run typecheck/lint/test/build` pass; the window opens; hardened webPreferences, CSP, navigation/window/permission blocks and the single-instance lock are in code | 0.25 / 0.5 / 1 h |
| **P1 — Engine & store** *(riskiest first)* | zod schemas (write and load variants); money/date utils; `cycles`, `obligations`, `pot`, `reports` engine; JSON store (atomic write + retry, snapshots, corruption fallback and recovery, migrations, newer-schema read-only); IPC commands with validation, lock checks and referential rules | Unit tests for every rule in 05 §3–§9, including: the worked example; payday 31 / Feb / leap year; first cycle in the past; early cycle start (B1 example + bounds); overspend past zero, then a payment; nearest-due reservation with eventual amounts; skipped instances; prepaying a future instance; rollover across 3 cycles; 0 or 2 instances in a cycle; safe-to-spend with a deficit and a bill due tomorrow; per-day change on the current cycle only; valuation estimate; months left. Store tests: atomicity, corrupt file → snapshot, no valid snapshot → recovery, a future-dated item loads fine, rejected imports | 0.5 / 1 / 2 h |
| **P2 — Core UI** | App shell and navigation; setup wizard; dashboard (today, pot, bills with pay/skip, safe-to-spend, quick add, nudges/banners); transactions; obligations; pot history; settings (general and categories) | The worked example reproduced through the UI matches 05 §5; empty and error states present; keyboard-only quick add; the Playwright smoke test (setup → expense → pay bill → reload, asserting figures) passes against the **unpackaged** `out/` build | 1 / 2 / 3 h |
| **P3 — Goals, investments, reports** | F6, F7, F8 with Recharts | Figures match the 05 §6–§7 unit tests; charts render in light and dark; empty states present | 0.5 / 1 / 2 h |
| **P4 — PIN, backups, data** | F9 backups and data, F10 PIN, auto-lock, CSV, last-export nudge | Locked state refuses data IPC (tested); backoff enforced in main; malformed, oversized and hostile JSON imports rejected (tested); restore writes `pre-restore`; CSV escaping per T12; **owner restore drill**: export → import into a fresh `DAILYPOT_DATA_DIR` → figures identical | 0.5 / 1 / 1.5 h |
| **P5 — Package & release** | `app://` privileged protocol with CSP header; network block; fuses; electron-builder NSIS + portable; icon; GitHub Actions release on tag with checksums; README with screenshots and the SmartScreen note | The installer builds locally. The packaged app launches, and a launch script confirms the window loads and no outbound request happens. Playwright can't attach to a packaged app once the `EnableNodeCliInspectArguments` fuse is off, so the packaged check is a script plus a manual run, and the E2E suite stays on `out/`. README instructions verified | 0.5 / 1 / 2 h |
| **Total** | | | **3.25 / 6.5 / 11.5 h** of owner time across the build |

## Testing strategy
- **Unit tests (Vitest)**
  - Cover `src/shared/**` (engine and utils) and `src/main` store and IPC handlers, using a temp dir and fake Electron APIs where needed.
  - The engine suite is the highest-leverage one, because that's where the money rules live.
  - The IPC suite is the equivalent of authorization testing. Each command:
    - rejects invalid or unknown-key payloads,
    - rejects requests while locked,
    - enforces the referential rules.
- **E2E smoke test (Playwright `_electron`)**
  - Launches the built, unpackaged app with `DAILYPOT_DATA_DIR` pointing at a temp folder.
  - Walks setup → expense → bill → reload and takes screenshots.
- **CI gates:** typecheck (strict), lint, unit tests, `npm audit --audit-level=high`, build. Red CI means no merge or release.

## Pre-mortem: "a year from now DailyPot failed because…"
| Cause | Rough probability | Earliest warning sign | Counter |
|---|---|---|---|
| The owner stops logging after 2–3 weeks because entry is too slow | 35% | Unlogged days in the first cycle | 3-step quick add with remembered category; the "nothing logged yesterday" nudge with ✓ I spent nothing; skip and pay in one click |
| The pot number feels "wrong", so the owner stops trusting it | 20% | The owner recalculates by hand | Pot history (F5) with unlogged days marked; reservation explanations in toasts; the worked example in docs and tests; skip-a-month (no locked-up pot) |
| Data loss (corrupt file, disk failure, accidental import, two instances) | 10% | Any corruption banner | Single-instance lock; atomic writes; 14 snapshots; pre-import/restore/migration backups; "last export N days ago" nudge |
| Public users give up at the SmartScreen warning | 40% (low impact) | Issues saying "Windows blocked it" | README walkthrough, checksums, signing decision D2 |
| Dependency or Electron churn breaks the build months later | 25% | CI red on Dependabot PRs | Exact pins, lockfile, CI on every PR, a small dependency set |
| A logic bug in the pot math gives wrong guidance | 10% | Pot history doesn't match expectations | Exhaustive engine tests; every bug report gets a failing test first |

No personal data ever reaches the maintainer, so the app needs no privacy notice or terms. The README states that data stays local. Re-check this if network features are ever added.
