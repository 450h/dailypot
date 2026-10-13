# 06 — Features

Every screen defines **empty, loading and error states** ([DEVELOPMENT-FRAMEWORK §7](frameworks/DEVELOPMENT-FRAMEWORK.md)).

**Money inputs** accept `70`, `70.5` or `70.50`. They reject negatives and more than 2 decimals, and cap at 10,000,000.00. User text (notes, names) is rendered with `dir="auto"`, so Arabic notes display correctly.

## F1 — First-run setup wizard
Steps:
1. **Currency**, chosen from the 2-decimal list in 05 §1 (default SAR).
2. **Payday**, 1–31. Pick your salary day; the field starts empty with 27 suggested.
3. **Per-day allowance** (default 70).
4. **First cycle start**: default today, must be ≤ today, with a warning for past dates (05 §3).
5. **Obligations** (optional list): name, amount, due day. `startMonth` is defaulted per 05 §4.
6. **PIN** (optional): 4–8 digits, entered twice, with 6+ digits recommended.

The wizard shows a **plan preview**, e.g. "Cycle 13 Oct → 26 Oct (14 days) · cycle budget 980 · bills due this cycle 230".

**Acceptance:**
- Completing the wizard sets `setupComplete` and creates the first cycle and the obligations in one `setup:complete` command.
- Closing the app mid-wizard leaves `setupComplete=false`, and the wizard shows again.

## F2 — Dashboard (home)
- **Today card:** per-day, spent today, remaining (red if negative), the *safe* remaining (05 §5 safe-to-spend), and the projected pot after today.
- **Pot card:** current balance or deficit (it includes today's payments), the opening pot for this cycle, and a link to pot history.
- **Bills:** the set defined in 05 §6.
  - Each row shows the due date, effective amount, a status chip (Upcoming / Due today / Overdue / Paid / Skipped; text, not just colour) and an earmark bar (funded x/y).
  - Actions: **Mark paid** (amount and date prefilled; the date must be ≤ today) and **Skip this month** (with an optional note). After a payment, a toast shows "from pot X · from main balance Y", plus the reservation explanation when relevant (05 §5 rule 4).
- **Safe-to-spend line:** the wording follows 05 §5.
- **Cycle strip:**
  - Cycle dates and "day X of Y".
  - **Change per-day** for the current cycle, with a preview of the pot change and a confirmation.
  - **Salary arrived early? Start new cycle**, shown only within 7 days of payday, with a start-date picker (05 §3).
- **Quick add:**
  - The amount field has autofocus.
  - The category select remembers the last category per kind.
  - Kind toggle: Daily / Non-daily / Income.
  - Optional note. The date defaults to today, with today as the maximum.
  - **Enter saves.**
- **Nudges/banners:**
  - "No spending logged yesterday: add it, or ✓ I spent nothing" (writes `confirmedDays`).
  - "New cycle started — confirm your per-day".
  - "Data was restored from a backup".
  - "Read-only: data file is from a newer version".
  - "Last export N days ago" (shown when it's 30+ days or never).

## F3 — Transactions
- A list grouped by date, newest first, with daily totals.
- Filters: cycle, kind, category, and text in the note.
- Rows can be edited and deleted. Deletes show an undo toast, which re-creates the item with the same id.
- **CSV export** of the current filter.

## F4 — Obligations
- CRUD for recurring bills: name, amount, due day, category, **start month**, end month (optional), note.
- Separate lists for active and archived bills.
- **Per-bill history:** monthly instances with their settlements (paid/skipped). Settlements can be edited or deleted.
- **Archive** follows 05 §2. **Delete** works only if the bill has no settlements.

## F5 — Pot history
A per-day table for the selected cycle:

| Column | Shows |
|---|---|
| Date | **unlogged** days are marked; confirmed no-spend days show ✓ |
| Per-day | allowance for that day |
| Daily spent | total daily spending |
| Delta | allowance minus daily spent |
| Bill payments | each payment's fromPot/fromMain split |
| Pot after the day | running balance |

The header shows the opening pot and the closing or current pot. This screen makes the pot **explainable**.

## F6 — Savings goals
- **Cards:** name, progress bar, saved/target, target date, needed per month (05 §7).
- **Actions:** add a contribution or a withdrawal; view history; archive; delete (with confirmation, cascades).

## F7 — Investments
- **Holdings table:** name/symbol, net invested, current value (with the valuation date, or the "estimated" / "no valuation yet" / "closed" labels), gain/loss and %.
- **Portfolio totals.**
- **Per holding:** add a buy or sell (amount, optional quantity, date), and update the current value.
- Prices are entered by hand by design ([ADR-0005](decisions/0005-no-network-no-auto-update.md)).

## F8 — Reports
- **Cycle summary** (05 §6) for the selected cycle, compared with the previous cycle.
- **Spending by category:** bar chart for daily and non-daily spending.
- **Daily spend vs per-day:** bar per day with an allowance line.
- **Pot balance over time:** line chart.
- **Cycle-over-cycle:** the last 6 cycles' daily spend, closing pot and shortfall total.
- **Portfolio:** net invested vs value per holding.

Charts show text values alongside the bars and lines, use accessible colours, and work in both themes.

## F9 — Settings
- **General:** currency, payday (with a preview of the next two cycles), theme.
- **Categories:** add, rename, recolour, archive.
- **PIN:** set, change (requires the current PIN) or remove. Also: auto-lock after N idle minutes, lock on the Windows lock screen, and Lock now.
- **Backups:**
  - Snapshot list with restore. Restore asks for confirmation and writes a `pre-restore` backup first.
  - Open the backups folder.
- **Data:**
  - Export everything to JSON through a save dialog. This updates `lastExportAt`.
  - Import JSON through an open dialog chosen in main:
    1. Validate the file.
    2. Show a summary (counts and date range).
    3. Confirm "replaces all data".
    4. Write a `pre-import` backup.
    5. Replace the data.
  - Export transactions to CSV.
- **About:** version, license, data folder path, and a GitHub link that opens in the system browser (hardcoded URL).

## F10 — PIN lock
- When a PIN is set, the app opens on the lock screen.
- **Wrong PINs:** delays grow 1s, 2s, 4s… up to a 30s cap, enforced in main. The backoff resets when the app restarts. That's acceptable for a privacy screen, and it's documented.
- **Auto-lock:** idle time comes from `powerMonitor.getSystemIdleTime()`, and the app also locks on the `lock-screen` event.
- **No recovery:** the lock screen says so, and explains that deleting `security.json` removes the PIN. This is a privacy screen, not encryption ([07](07-threat-model.md) T4).

## API surface (preload → main IPC contract)
| Channel | Payload (strict zod) | Returns |
|---|---|---|
| `state:get` | – | `AppState` + `meta` {`readOnly`, `restoredFromBackup`, `recoveryNeeded`, `dataPath`, `version`, `today`, `locked`, `pinSet`} |
| `entity:upsert` | `{ collection ∈ allowlist (05 §2), item }` | `AppState` |
| `entity:delete` | `{ collection ∈ allowlist, id }` | `AppState` |
| `settings:update` | `Partial<{currency, payday, theme, autoLockMinutes}>` | `AppState` |
| `setup:complete` | `{ settings, dailyAllowance, firstCycleStart, obligations[], pin? }` | `AppState` |
| `cycle:setAllowance` | `{ dailyAllowance }` (current cycle) | `AppState` |
| `cycle:startNextEarly` | `{ startDate }` | `AppState` |
| `pin:status` / `pin:verify {pin}` / `pin:set {current?, next}` / `pin:clear {current}` / `pin:lock` | PINs: 4–8 digits | `{ok, retryAfterMs?}` |
| `backup:list` / `backup:restore {name}` / `backup:openFolder` | `name` must match the snapshot regex (07 T2) | list / `AppState` |
| `data:export` / `data:import` / `data:exportCsv {ids}` | paths come only from main-process dialogs | `{ok}` / `{cancelled}` / error |
| `recovery:startFresh` | – (only when `recoveryNeeded`) | `AppState` |
| `app:openRepo` | – (fixed URL) | – |
| **push** `app:event` (main → renderer) | `{type: 'locked' \| 'stateChanged'}`, sent on auto-lock or midnight rollover | – |

- Errors cross IPC as `{ ok: false, code, message }`. There are no raw stack traces.
- **Commands** return the full state. That's fine at personal scale.

## Trust, safety & admin
This is a single-user local app, so there's no moderation. The destructive operations (import, restore, cascading deletes, start fresh) each need confirmation and write a backup first.
