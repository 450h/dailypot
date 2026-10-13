# ADR-0001 — Stack: Electron + React + TypeScript
- Status: Accepted
- Date: 2026-10-13

## Context
The owner wants a downloadable Windows desktop app that's simple to use and published publicly for others. Node 22 and Python 3.12 are installed; Rust and .NET are not. The owner chose Electron + React at intake.

## Decision
- **Electron 44.x** (current supported major), **React 19**, **TypeScript 5.9** strict. npm lists `typescript@7.0.2` (released 2026-07-08) as latest. We stay on 5.9.3 to avoid compatibility risk with electron-vite and typescript-eslint while the 7.x line settles (a judgement call; revisit at checkpoint C3).
- **electron-vite 5** for dev and build. It supports Vite ≤ 7 (checked via `npm view electron-vite@5.0.0 peerDependencies` on 2026-10-13), so we use **Vite 7.3.x** with **@vitejs/plugin-react 5.x**.
- **zod 4** for schemas, **Recharts 3** for charts, **Vitest** for unit tests, **Playwright** `_electron` for the smoke test, **electron-builder 26** for the NSIS and portable builds.
- Plain CSS with design tokens (no CSS framework) and the system font stack (offline, no CDN). Simple in-app navigation state (no router).
- Exact versions are pinned in `package.json`, with the lockfile committed.

## Consequences
The download is large because Electron bundles Chromium: the v0.1.0 NSIS installer measured 115 MB (2026-10-13). Contributors get familiar web tooling. Security depends on Electron hardening (SECURITY-FRAMEWORK §11).

## Alternatives considered
Python + PySide6 (smaller, but harder to style and chart); Tauri (tiny, but needs the Rust toolchain).

## Reversal cost
Rewriting the UI and main layer would take weeks. The shared engine (`src/shared`) is plain TS and would survive a port.
