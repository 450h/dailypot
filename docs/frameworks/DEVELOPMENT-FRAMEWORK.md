# Development Framework — Engineering Rules (DailyPot)

> **Binding conventions** for building on Electron 44 + React 19 + TypeScript 5.9 (electron-vite 5 / Vite 7), maintained by **one person**. Security rules live in `SECURITY-FRAMEWORK.md`. Section numbers match the template; gaps are intentional.

Legend: 🔴 MUST · 🟡 SHOULD · 🟢 GUIDANCE.

## 0. First principles
1. **One source of truth per concept.** Types come from zod schemas (`src/shared/schema.ts`). Money rules live only in `src/shared/engine/`. Formatting lives only in `src/shared/money.ts` and `dates.ts`.
2. **Boring and small.** Few dependencies, no state-management library, no router, no CSS framework. A solo maintainer must be able to come back after 6 months and understand it.
3. **Pure engine, thin edges.** The engine is a pure function of `(state, today)`. The main process does I/O and validation. React renders.

## 2. Types & validation
- 🔴 `strict: true`; no `any` (use `unknown` and narrow); `noUncheckedIndexedAccess` on.
- 🔴 Schema-first: `z.infer` types only. Never hand-write a parallel interface for stored data.
- 🔴 The same schema validates in the renderer (form UX) and main (security).
- 🔴 Dates are `YYYY-MM-DD` strings validated by regex plus a real-date check. Never `new Date('YYYY-MM-DD')` (that parses as UTC). Use the helpers in `dates.ts`.

## 3. Backend & data layer (main process + JSON store)
- 🔴 Changes to the data shape bump `schemaVersion` and add a forward-only migration with a test. Never edit a shipped migration.
- 🔴 A backup (`pre-migration-*`) is written before a migration saves.
- 🔴 Every write goes through `store.commit()` (validate → atomic write → snapshot). No other code touches `data.json`.
- 🔴 No business math in main beyond validation. Figures come from the shared engine.

## 7. Design system & UX states
- 🔴 Design tokens (colours, spacing, radii, type scale) are defined once as CSS variables in `src/renderer/src/styles/tokens.css`, with light and dark sets. `prefers-color-scheme` is used unless the user overrides it.
- 🔴 Every screen defines its **empty, loading and error states**, with recovery copy.
- 🔴 Destructive actions need confirmation. Deletes show an undo toast where feasible.
- 🟡 System font stack. No web fonts and no CDN (the app works offline).

## 8. Testing
- 🔴 **Engine tests are the critical suite.** Every rule in docs/05 §3–§7 has a test, and every bug gets a failing test first.
- 🔴 IPC/store tests: validation (positive and negative), lock refusal, atomic write, corruption fallback, import rejection, migrations.
- 🟡 Playwright `_electron` smoke test before each phase sign-off and each release.

## 9. Git, CI/CD, environments & observability
- 🔴 The `local → release` environments are dev (`npm run dev`, own data dir via `DAILYPOT_DATA_DIR` if wanted) and packaged builds. Never develop against your real data folder; use a test data dir.
- 🔴 CI on every push/PR: `npm ci`, typecheck, lint, unit tests, `npm audit --audit-level=high`, build. Red CI means no merge or release.
- 🔴 Releases come only from GitHub Actions on a `v*` tag, with checksums attached.
- 🟡 Small commits with conventional messages, even solo. Semantic versioning.
- 🟢 Each roadmap phase leaves the app runnable and QA-testable.

## 10. Performance & accessibility
- 🟡 The dashboard computes in < 50 ms with 5 years of data (~20k transactions). Memoise engine calls per state version.
- 🔴 Accessibility baseline (WCAG 2.2 AA spirit): every control labelled, visible focus ring, keyboard-only operation of quick add and dialogs, colour never the only signal (status chips have text), contrast ≥ 4.5:1 in both themes, and `prefers-reduced-motion` respected.

---
## Pre-merge development checklist
- [ ] Shapes come from zod schemas; strict TS; lint clean.
- [ ] Data-shape change = schemaVersion bump + migration + test + pre-migration backup.
- [ ] Money rules only in `src/shared/engine`; amounts in integer minor units; dates via `dates.ts`.
- [ ] Empty/loading/error states present; keyboard and labels OK; both themes checked.
- [ ] Engine/IPC tests added or updated; CI green; lockfile committed.
