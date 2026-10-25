# OPEN QUESTIONS (DailyPot)

A running log of everything unresolved. Not legal advice.

## 🟥 NEEDS LEGAL/EXTERNAL COUNSEL
| # | Question | Why it matters | Best current read | Confidence |
|---|---|---|---|---|
| L1 | None identified. | The app holds no third-party data, moves no money and sends nothing off the device. | Reopen this if cloud sync, telemetry, bank import or any network feature is ever added. | Medium |

## 🟦 NEEDS MY DECISION
| # | Decision | Options | Recommendation | Blocking? |
|---|---|---|---|---|
| D1 | **Final app name**. 2026-10-13: the owner chose the repo name `dailypot`, so the app ships as **DailyPot** for v0.1.0; a rename later is still possible. "DailyPot" is the working name; at intake you replied "What did I forget?" instead of naming it. | Keep DailyPot · Perday · something else | Keep DailyPot unless you prefer another. Renaming touches `productName`/`appId` and the data folder name, so decide **before the first public release**. | Before the v1.0 release |
| D2 | **Code signing** of the Windows installer | Unsigned + checksums (free) · OV/EV certificate (paid, yearly) · cloud signing service (paid) | Unsigned for v1, documented in the README. Revisit if public users struggle (C4). | No |
| D3 | **Encryption at rest**. The PIN currently only locks the UI. | Leave as is · opt-in encryption keyed by the PIN (forgetting the PIN means losing the data) | Leave it for v1 and reconsider after you've used the app | No |
| D4 | Different allowance on weekends or specific days | One per-day (v1) · per-weekday amounts · per-day overrides | Keep one per-day and revisit after the first cycle | No |
| D5 | Pot deficit at cycle end: carry it over (current rule) or reset to 0 | Carry (consistent with "overspend comes from the pot") · reset | Carry, because it's the honest number | No |
| D6 | macOS/Linux builds | Windows only (v1) · add mac/linux targets to CI | Windows only. electron-builder can add the other targets later. | No |
| D7 | Auto-paid (direct debit) bills marked paid automatically on the due date | Manual "Mark paid" (v1) · a per-bill auto toggle | Manual for v1. Add the toggle if marking bills paid becomes a chore. | No |
| D8 | Backlog left out of v1 | Yearly/quarterly bill sinking funds · zakat estimate · debt tracker · bill reminders · Arabic/RTL · bank CSV import · live prices · multi-currency incl. 3-decimal currencies | Revisit after C1 | No |
| D9 | When a bill was partly paid from the main balance (shortfall) and the pot later ends the cycle with money left, should the leftover **pay back that shortfall** before rolling over? Example: day 1 overspend makes the pot −50, the phone bill (80) is paid from main on day 2, and the pot ends the cycle at 160. | Roll over everything (current rule) · repay same-cycle shortfalls first, then roll over the rest | Keep the current rule (simplest, and it matches "surplus rolls over"). Switch if you think of the pot as "money that pays this month's bills". | No |
| D11 | ~~GitHub repo URL~~ **Resolved 2026-10-13:** the owner chose `github.com/450h/dailypot`; `REPO_URL` updated. | – | – | – |
| D10 | Your weekly hours for reviewing and maintaining this. Not asked at intake. | – | Assume ≤ 1 h/week after launch | No |
| D12 | **Balance semantics (v0.2.0).** The main balance is an anchor plus flows (ADR-0007). Goal contributions and investment buys are treated as cash that *left* the main balance, and an archived goal/holding is treated as closed (it stops counting in net worth). Decided 2026-10-25 without the owner. | Keep · count goals/investments inside the main balance · keep archived goals counting | Keep; it matches the Reports cash-flow line and the "Archived (hidden from totals)" wording. Revisit if your goals live in the same bank account. | No |
| D13 | **Animations setting.** The dashboard choreography replays on every entry (owner request). If it ever annoys, an `Animations: Match Windows / On / Off` setting needs a schemaVersion bump. | Follow the OS only (current) · add a setting | Follow the OS until you have used it for a cycle. | No |
| D14 | **Editing past cycles.** `cycle:extendBack` prepends history, but a closed cycle's per-day or boundaries still cannot be edited (docs/05 §3). | Keep closed cycles immutable · allow editing a closed cycle's per-day with a pot-change preview | Keep immutable; extend-back plus confirmed days covers the backfill case. | No |
| D15 | **Widget containment.** 09 §5.4/§7.7 originally required `contain: content`; the renderer uses `contain: layout style` because paint containment clips the Day Strip popover (`.strip-pop`, `position: absolute` below the cell). Decided 2026-10-25 without the owner; 09 now says `layout style`. | Keep `layout style` (current) · restore `contain: content` and portal `.strip-pop` to `<body>` | Keep; the paint-containment gain on ~8 widgets is negligible and a portalled popover would need rect measurement plus scroll tracking inside `.main`. | No |

## 🟨 CHECKPOINTS
| # | What we check | Threshold | Check date | Result |
|---|---|---|---|---|
| C1 | **Success metric:** spending logged on ≥ 25 days of the first full cycle, and every bill in that cycle recorded as paid or skipped | Below that, simplify data entry (see the pre-mortem) before adding features | End of the first full cycle after install. **Assumes payday on the 27th**, which was the suggested default; you chose "configurable" and haven't given the actual day. With install by 2026-10-26 that's **2026-11-26**. Move this date once your payday is set. | |
| C2 | Pot trust: you recompute one random day from the pot history by hand and it matches | Any mismatch is a bug and gets a failing test | 2026-11-26 | |
| C3 | Dependency health: Dependabot PRs merged, Electron on a supported major, TS 7 re-evaluated | If the Electron major is unsupported, upgrade before the next release | 2027-04-13 | |
| C4 | Public feedback: GitHub issues about installing / SmartScreen | ≥ 3 issues → revisit D2 | 2026-12-15 (about 30 days after the planned first public release) | |
| C5 | Restore drill: export, import into a fresh data dir, figures identical | Any difference blocks the release | At P4 sign-off and before each release | |
