# ADR-0006 — MIT license
- Status: Accepted
- Date: 2026-10-13

## Context
The code goes in a public GitHub repo for anyone to use. The owner chose MIT at intake.

## Decision
MIT License. The copyright holder is "450h" (the GitHub username from git config). The owner may change it to their legal name in `LICENSE` before the first release.

## Consequences
Anyone may use, modify and redistribute the code, including commercially, as long as they keep the notice. Dependencies must be MIT-compatible. Checked with `npm view <pkg> license` on 2026-10-13 (High):
- **MIT:** electron 44.7.0, react 19.3.0, recharts 3.10.1, zod 4.6.7, vite 7.3.7, electron-vite 5.0.0, electron-builder 26.15.3, vitest 5.0.4.
- **Apache-2.0:** @playwright/test, typescript.
- **ISC:** lucide-react.

All of these are compatible. Verify the license of any new dependency.

## Alternatives considered
GPL-3.0 (forces derivatives to stay open); Apache-2.0 (adds a patent grant and is more formal).

## Reversal cost
Released code stays MIT forever. Only the copyright holder(s) can relicense future versions.
