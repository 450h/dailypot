# DailyPot — Product & Technical Specification

A free, offline Windows app for personal finance. You set a per-day allowance; whatever you don't spend goes into a side pot that pays your monthly bills. It also includes savings goals, an investment tracker and reports.

_Generated with the `new-project` skill (claude-skills commit `5b77abd`) on 2026-10-13._

## ⚠️ How to read this
- **Who runs it:** a solo owner. Claude Code builds the app and a QA agent reviews it. Estimates are sized for that.
- **Not legal advice.** Vendor and technical claims were checked against sources on 2026-10-13 and are cited inline with a confidence label. Unresolved items are in [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).
- **Profile: "Local-first Lite".** There's no server, no money moving through the app, no third-party data processor, and no data reaching the maintainer. That means the server-side `OPERATIONS.md`, privacy and payments documents don't apply. **The end user's data is still real and precious**, so durability is designed into the app itself ([ADR-0002](decisions/0002-local-json-storage-and-backups.md): atomic writes, daily snapshots, export/import). Re-run the skill's Conditions table if the app ever gains sync, telemetry, accounts or payments.

## Delivery process (owner-chosen, replaces the two stop-gates)
The docs are written first. Then a **QA agent** reviews them and its findings are fixed. Next the app is built in phases P0–P5 ([08](08-roadmap-and-risks.md)), with a report to the QA agent after each phase until it signs off. Finally the owner reviews the finished app.

## Reading order
1. [Product overview](01-product-overview.md): users and jobs, journeys, substitutes, success metric, v1 scope
2. [Architecture](04-architecture.md): process diagram, data location, distribution, one-way doors
3. [Data model & pot engine](05-data-model.md): **the money rules**, entities, IPC authorization, state machines
4. [Features](06-features.md): screens, acceptance criteria, IPC contract
5. [Threat model](07-threat-model.md)
6. [Roadmap & risks](08-roadmap-and-risks.md): phases, QA criteria, testing, pre-mortem
7. [Design system "Broadsheet"](09-design-system.md): tokens, typography, surfaces, dashboard composition, motion, per-page guidance (v0.2.0)
8. [Renderer components](10-renderer-components.md): the hooks, atoms and visuals the UI is built from, and the e2e-sensitive names

Chapters 02 (monetization) and 03 (compliance) are intentionally absent: the app isn't commercial, has no regulated activity, and doesn't move money or hold third-party personal data.

## Scope & intake record
- **Intake summary:**
  - Personal finance desktop app for the owner (Saudi-based, SAR), published as a public MIT repo.
  - Windows, offline, English only.
  - Payday-to-payday cycles with a per-day allowance. Unspent money feeds a side pot. Overspending comes out of the pot.
  - The pot pays bills nearest-due first, and any surplus rolls over.
  - v1 extras: reports and charts, savings goals, a stock-investment tracker, non-daily expenses, an optional PIN.
  - Stack: Electron + React. Operator: solo. Budget: free/lean.
- **Contradictions found:**
  - (1) The owner's answer in the name field was "What did I forget?". This was treated as a question: it was answered with suggestions, and the name was logged as D1.
  - (2) "Nothing remote" conflicts with live stock prices and auto-update. Both were dropped (ADR-0005).
  - (3) The skill's two gates were replaced by the owner's QA-agent flow.
  - (4) The skill defines Lite as "no production data", but this app holds real financial data from day one, on the user's own PC. So data durability is moved into the app (ADR-0002), and there's an owner restore drill (OPEN-QUESTIONS C5) and a downgrade/rollback note (05 §9).
  - (5) Payday 27 is a *suggested* default. The owner chose "configurable" without giving their actual day (C1 depends on it).
- **QA review of these docs (2026-10-13):** CHANGES REQUIRED, with 8 blocking and 23 non-blocking findings, all addressed in 05/06/07/08, the frameworks, the ADRs and OPEN-QUESTIONS (D9, D10, C5 added).
- **Vendor check:**
  - No data-holding vendors.
  - Dependency versions and licenses were checked on npm on 2026-10-13 (High): electron-vite 5.0.0 declares peer `vite ^5 || ^6 || ^7`, so Vite 7 is pinned. All licenses are MIT/ISC/Apache-2.0 (ADR-0006).
  - Electron security checklist: [electronjs.org](https://www.electronjs.org/docs/latest/tutorial/security), High.
  - Unsigned-installer behaviour: [electron.build](https://www.electron.build/docs/features/code-signing/), Medium.
- **Flags set:** `IF_UI`, `IF_SOLO`. Lite-style operator profile (no `IF_PROD_DATA` server ops, no `IF_PII` processing by the maintainer, no `IF_PAYMENTS`, no `IF_COMPLIANCE`, no `IF_THIRD_PARTY`). Single language, so no `IF_LOCALIZED`/`IF_RTL`.

## Engineering frameworks (read before coding)
- [frameworks/SECURITY-FRAMEWORK.md](frameworks/SECURITY-FRAMEWORK.md)
- [frameworks/DEVELOPMENT-FRAMEWORK.md](frameworks/DEVELOPMENT-FRAMEWORK.md)

## Foundations
- [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) · [GLOSSARY.md](GLOSSARY.md) · [decisions/](decisions/)
- Repo root: [../CLAUDE.md](../CLAUDE.md), [../README.md](../README.md), [../.env.example](../.env.example), `.github/` templates.
