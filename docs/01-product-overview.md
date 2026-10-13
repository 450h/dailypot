# 01 — Product overview

## Premise
**DailyPot** (working name) is a free, offline, open-source personal finance app for Windows. It's built around one habit: **give yourself a fixed per-day spending allowance. Whatever you don't spend that day goes into a side pot, and the pot pays your monthly bills** (phone, gym, subscriptions). Your salary then covers daily life *and* the bills, and the leftover goes to savings and investments.

## Users and their jobs
| User | Job they hire DailyPot for | What they use today |
|---|---|---|
| **The owner** (primary; Saudi-based, paid in SAR on a monthly payday) | "Tell me what I can spend today, and show me that my unspent money is paying my bills." | Mental math, bank app, notes |
| **Open-source downloader** (secondary; anyone on GitHub) | "A simple private budget app with no account, no cloud and no ads." | Spreadsheets, YNAB/Monarch-style subscription apps, phone apps that need an account |
| **Contributor** (tertiary) | "A small, readable codebase I can extend." | n/a |

## Top journeys
1. **Log an expense (daily, the core loop): 3 steps.** Open the app → type the amount (category remembered, "daily" by default) → Enter. The dashboard immediately shows today's remaining amount and the projected pot.
2. **Pay a bill: 2 steps.** Dashboard → "Mark paid" on the bill (amount and date prefilled). The app shows how much came from the pot and any shortfall from the main balance.
3. **New payday: 2 steps.** The app detects the new cycle → you confirm or adjust the per-day. The pot surplus rolls over automatically.
4. **Monthly review: 1–3 steps.** Reports → cycle summary, category breakdown, pot history, goals and portfolio.

## Substitutes (including doing nothing)
- **Doing nothing / mental budgeting.** Free, but nothing connects "I didn't spend today" to "my bill is covered."
- **Spreadsheet.** Flexible, but you have to build the per-day → pot logic yourself, and it's fiddly to log daily.
- **Envelope / zero-based budgeting apps** (YNAB-style). Powerful but subscription-based, cloud-synced and account-based. They allocate *income* to categories rather than rolling *unspent daily allowance* into bills.
- **Bank and phone budgeting apps.** Automatic, but online, tied to one bank, and without the per-day-to-pot mechanic.

DailyPot's differentiator is the **per-day → pot → bills** mechanic, in an app that is fully offline, needs no account, and is free/MIT.

## Demand evidence
| Evidence | Grade | Notes |
|---|---|---|
| The owner will use it daily | **usage (self)** | The primary goal is personal use. |
| Public downloaders | **opinion** | None yet. No commercial stakes, so it isn't make-or-break. |

This isn't a commercial product, so no demand-validation phase is required. Success is measured on the owner's own use (below).

## Definition of success (one metric)
**During the first full cycle after install, the owner logs spending on ≥ 25 of the cycle's days, and every bill in that cycle is recorded as paid.** The checkpoint is in [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) C1.

## v1 scope
**In:**
- Setup wizard.
- Payday-to-payday cycles with a per-day allowance, the side pot and obligations (rules in [05-data-model](05-data-model.md)).
- Daily, non-daily and income transactions with categories.
- Savings goals.
- Stock and investment tracker (manual values).
- Reports and charts.
- Optional PIN lock.
- Automatic local backups, export/import (JSON) and CSV export.
- Light and dark themes.
- Windows installer.

**Out (backlog, see OPEN-QUESTIONS D8):** yearly/quarterly bill sinking funds, zakat estimate, debt tracker, bill reminders and notifications, Arabic/RTL, bank import, live stock prices, multi-currency, cloud sync, macOS/Linux builds.
