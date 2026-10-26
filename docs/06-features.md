# 06 — Features

Every screen defines **empty, loading and error states** ([DEVELOPMENT-FRAMEWORK §7](frameworks/DEVELOPMENT-FRAMEWORK.md)). The look is the "Broadsheet" design system ([09](09-design-system.md)); the renderer atoms it is built from are in [10](10-renderer-components.md). This chapter describes what each screen shows and does as shipped in v0.2.0.

**Money inputs** accept `70`, `70.5` or `70.50`. They reject negatives and more than 2 decimals, and cap at 10,000,000.00. User text (notes, names) is rendered with `dir="auto"`, so Arabic notes display correctly. Figures that count up on entry (`Count`) settle on the exact engine value; nothing in the renderer computes money.

**Shell.** A 232px sidebar (64px rail under 1040px) with the brand mark, the eight pages, and count badges: **Pot history** shows the number of unlogged days (current cycle + the previous 7 days), **Bills** the number of overdue bills; both hidden at 0. The footer has **Lock now** (when a PIN is set) and a backup line `Backup 6d ago · v0.2.0` whose dot turns warn when the last export is 30+ days old or there was none. Every page starts with a sticky header: a mono **dateline** (context) over the page `h1`, actions on the right.

## F1 — First-run setup wizard
Four steps (`Basics · Per-day · Bills · PIN`), shown as a mono dateline `Step 1 of 4 · Basics` and four ink segments, one card per step, with **Back / Next** and **Start using DailyPot** on the last step:
1. **Basics:** **Currency** from the 2-decimal list in 05 §1 (default SAR). **Payday (day of month)**, 1–31, starts empty with 27 suggested. **Start tracking from**: default today, must be ≤ today and ≥ today − 62 days (05 §3); a past date shows "⚠ N past day(s) with no entries will each add your full per-day to the pot. Backfill them or start today." **Main balance today (optional)** with an **In credit / Overdrawn** toggle: the cash in your main account right now, from your bank app.
2. **Per-day allowance** (default 70).
3. **Bills** (optional rows): name, amount, due day. `startMonth` is defaulted per 05 §4.
4. **PIN** (optional): 4–8 digits, entered twice, with 6+ digits recommended. The card says it's a privacy screen, not encryption.

Below the card, once payday, start and per-day are valid, a **First cycle** preview card: `13 Oct 2026 → 26 Oct 2026 · 14 days`, a Day Strip of the cycle (past days dotted as unlogged, today outlined, future grey; words only when the cycle is longer than 62 days), and two tiles **Cycle budget** (per-day × days) and **Bills due this cycle**.

**Acceptance:**
- Completing the wizard sets `setupComplete` and creates the first cycle and the obligations in one `setup:complete` command.
- If a main balance was entered, the wizard then sends one `settings:update` with `balanceAnchor = anchorForBalanceNow(state, today, ±amount)` (05 §10), so the dashboard's first masthead reads exactly the typed figure. If that second write fails, setup is still complete and the balance can be set under Settings.
- Closing the app mid-wizard leaves `setupComplete=false`, and the wizard shows again.

## F2 — Dashboard (home)
Dateline `SUN 25 OCT 2026 · DAY 29 OF 30 · PAYDAY IN 2 DAYS`, headline `Today · 25 Oct 2026`. Fifteen widgets on a 12-column bento, in this order:

- **Masthead: live main balance** (09 §6.1). The hero figure is `computeBalance(state, today).balance`. Eyebrow **Main balance** when anchored (**Main balance (overdrawn)** when negative, which renders with U+2212 in the negative colour); when unanchored, **Change since 27 Sep** with a **Set your balance** button. A pulsing live dot reads "as of today, recalculated from your history". Under the figure, a **30-day balance sparkline** (`balanceSeries(state, today, 30)`; warm fill below zero) or "No balance history yet". To the right, a mono **ledger**: `Anchor 27 Aug  8,500.00` (or `From 27 Sep  0.00` when unanchored), then `Income +`, `Spending −` (daily + non-daily), `Bills −`, `Saved −`, `Invested −`, and **Adjust anchor** / **Set anchor**.
  - **Balance dialog** ("Set your main balance" / "Adjust your main balance"; shared with Settings and Reports): shows the current figure and anchor; field **My balance right now is (SAR)** (prefilled only when adjusting an existing anchor; unanchored it starts empty and Save stays disabled, because the derived figure is not a bank balance) with an **In credit (+) / Overdrawn (−)** toggle; a collapsed **As of a different date** section with a date ≤ today, which relabels the field **My balance at the start of <date> was** and shows the preview "With everything recorded since, today's balance will read X". Save stores `anchorForBalanceNow` for today or `{date, amount}` for a past date via `settings:update`; an `INVALID` answer from main (amount out of range) is shown on the field, never clamped. **Clear balance** (when anchored) stores `null`.
- **Net worth** (09 §6.2): `netWorth.total` at 40px, a stacked bar in the fixed order **Cash · Savings · Investments** (cash hatched when negative), legend rows `Cash main balance` (or `change since <date>`), `Savings active goals`, `Investments portfolio value`, and the footnote "cash = main balance; goals and holdings count as money that left it". Unanchored: a link **Set your balance to make this a true net worth**.
- **Urgent banner** right under the masthead when `meta.restoredFromBackup`: "Your data file was damaged, so DailyPot restored the newest automatic backup…". (A read-only file from a newer version never reaches the dashboard: the router shows a full-screen notice instead.)
- **Day Strip ribbon** (09 §6.3): eyebrow `Cycle 27 Sep – 26 Oct`, `Day 29 of 30`, and either the chip **✓ Every day accounted for** or "N unlogged days to confirm below". The **strip** has one cell per cycle day, encoded by shape and colour (never colour alone), each with an `aria-label`/`title` such as "Tue 14 Oct, spent 52.00, 18.00 to the pot":
  | State | Cell | Click |
  |---|---|---|
  | closed, fed the pot (delta ≥ 0) | solid ultramarine | opens Pot history on that cycle and scrolls to / highlights the day's row |
  | confirmed no-spend (no entry on the day) | solid with a centred paper dot | same |
  | closed, drew from the pot | hollow, warm border, ▲ | same |
  | unlogged | warm tint, dotted border, `?` | popover **✓ Spent nothing** (writes `confirmedDays`) / **Add spending** (prefills the quick-add date and focuses the amount) |
  | today | ink outline | focuses the quick add |
  | future | grey | not interactive |
  Under the strip a 2px progress hairline and the legend `■ fed the pot · ▲ drew from it · ? unlogged · ◻ today · ░ future`. On the right, the **payday countdown** (counts down from the cycle length to N, eyebrow `days to payday`) and the actions:
  - **Change per-day**: a dialog for the current cycle only (05 §3), with the banner "The pot changes by X now (N past day(s) × Y)" before saving (`cycle:setAllowance`).
  - **Salary arrived early?**: shown only inside the window of 05 §3 (`earlyStartWindow`), with a **Salary arrived on** date picker bounded to that window, then **Start new cycle** (`cycle:startNextEarly`).
- **Today ring** (09 §6.4): a `.card` whose `.stat-label` is exactly **Left to spend today** and whose `.stat-value` is `per-day − spent today` (negative in the negative colour). The ring fills `spent / per-day` and shows an outer overflow arc when over; a warn tick marks `safeDaily / per-day` when safe-to-spend is below the per-day. Below: `Spent X of Y per-day`, then **Safe to spend per day** with the 05 §5 wording unchanged (all funded / `safeDaily` with "today: X left" / unavoidable shortfall "about X will come from your main balance", plus the `fromMainNow` line), and a chip: **✓ All bills funded**, **! Short by X**, or **● Safe X a day**.
- **Side pot** (09 §6.5): `.stat-label` exactly **Side pot**, `.stat-value` = `pot.balance` (it includes today's payments); sub line `Pot after today X · opened this cycle at Y` (prefixed `Pot deficit ·` when negative); chip **▲ +X vs opening** / **▼ −X vs opening** / **— unchanged since opening**. A 30-day sparkline of `balanceAfter` with a labelled **bill threshold** line (`Internet · 3 Nov`, the cumulative amount of open bills up to the first one the earmarks don't fully fund), or **Show table** (Date / Delta / Pot after, last 30 rows). Sentence: `X more to cover Internet`, `Covers every bill this cycle`, or `No bills left to cover this cycle`. Link **How the pot was built →**.
- **Cycle flow** (09 §6.6): a stacked bar of this cycle's income (`cycleSummary`): `Daily · Non-daily · Bills` in the ink ramp, `Invested · Saved · Left` in colour, with direct labels, a legend starting with `Income`, and the sentence `You kept X of Y this cycle` / `You spent exactly what you earned this cycle` / `You spent X more than you earned this cycle` (negative colour). A goal withdrawal or holding sale in the cycle is cash that came back: the legend shows the signed figure (`Saved −500.00`) plus a `Returned` row, and the sentence becomes `You kept X of Y this cycle (incl. Z returned from goals or holdings)` with Y = income + returned. Empty: "No income logged this cycle yet…".
- **Quick add command bar** (09 §6.7): a strip between two rules, eyebrow **Quick add**. Kind toggle **Daily / Non-daily / Income** (non-daily and income show a one-line reminder that they don't touch the pot); **Amount (SAR)** has autofocus (without scrolling the masthead away); the category select remembers the last category per kind; optional note; a **Date** field (default today, maximum today) with "Press Enter to add", replaced by a warning hint when the date is before the first tracked day. **Enter saves.** After a save: the amount field flashes, and a **receipt** replaces the toast for 8 s: `Saved 35.00 · Coffee · pot after today 1,215.00` (daily) / `… · from your main balance` (non-daily) / `… · added to your main balance` (income) with **Undo** (`entity:delete` of that id). An under-budget daily entry dated today sends an **ink drop** from the amount field to the pot figure, and the pot, hero and ring then re-count from their previous values.
- **Bills ledger** (09 §6.8): `dashboardBills` rows (the set of 05 §6): name, due date (mono), amount, a status chip with glyph **and** word (`✓ Paid`, `– Skipped`, `! Overdue`, `● Due today`, `→ Upcoming`) echoed by a 2px status bar on the row, then the funding meter `X / Y funded` (warm when overdue) or, once paid, the split `pot X · main Y`. Unsettled rows have **Mark paid** and **Skip**. Footer `Due this cycle X · funded Y · from main ~Z` (`dashboardBillTotals` over the same rows), link **Manage bills →**, and a note that figures are recalculated from history. The widget spans the full width when the Unlogged days widget is hidden. Empty: "No bills due this cycle…".
  - **Mark paid** opens the Pay dialog (F4): amount and date prefilled, the date must be between the first tracked day and today. After a payment, a toast shows `<Bill> paid · from pot X · from main balance Y`, plus "(Z of the pot is set aside for bills due sooner)" when 05 §5 rule 4 applied.
  - **Skip** opens the Skip dialog (optional reason) and writes a `skipped` settlement dated today.
- **Unlogged days** (09 §6.9): `derived.unlogged` = `unloggedDays(pot, current.startDate − 7 days, today)`: every **closed** day from 7 days before the current cycle to today with no daily transaction and no confirmation, newest first. Title **Unlogged days** with a count badge, subtitle "Each added your full per-day to the pot". Up to four items, each `Sun 19 Oct · added your full per-day 70.00 to the pot` with **Add spending** (prefills the quick add with that date) and **✓ Spent nothing** (writes `confirmedDays`; the item collapses, toast "Day confirmed"); then **and N more →** to Pot history. The widget is **not rendered** when there is nothing to confirm; the action never disappears while a day is unlogged.
- **Spending rhythm** (09 §6.10): one bar per cycle day against a dashed per-day line; under-budget days cool, over-budget days warm with a ▲ above, future days as empty slots; legend and **Show table** (Day / Date / Spent / Per-day).
- **Savings goals** (09 §6.11): **Saved so far** (the net-worth savings figure), then up to four active goals by amount saved: name, `saved / target`, meter (ok once reached), `save about X per month · N%` / `✓ Reached` / `target date passed` / `no target date`; link **Goals →** (**all goals →** when more than four).
- **Investments** (09 §6.12): tiles **Net invested**, **Current value**, **Gain / loss** (▲/▼, sign, percent); the top four holdings by value as paired bars (invested / value) with the basis note (`as of 12 Oct`, `estimated`, `no valuation yet`, `closed`); link **All holdings →**.
- **Where it went** (09 §6.13): `spendingByCategory` for the cycle up to today, top six plus **Other**, as horizontal bars split daily / non-daily with the category dot and the total at the bar end; **Reports →** and **Show table**.
- **Nudge footer** (09 §6.14), only when there is something to say: "A new cycle started. Your per-day is X — keep it or change it." with **Keep X** / **Change** (while `meta.newCycleStarted`), and "You haven't exported a backup yet." / "Last export N days ago." with **Export now** (never, or 30+ days).

**Choreography.** The shell renders `<Dashboard key={visit} />`, where `visit` increments every time the page becomes the dashboard, so the page remounts and the entrance replays on each visit: figures count up from 0, the strip stamps in day by day, ledgers and rows rise, charts draw behind a curtain, all within about 1.2 s. Count-ups pause while a dialog is open or the window is hidden. Under `prefers-reduced-motion` every figure resolves instantly, Recharts animation is off, the curtain, ink drop and live-dot pulse are gone.

When no cycle covers today, the page shows only the masthead, net worth and the banner "No budget cycle covers today. Restart DailyPot to roll cycles forward."

**Acceptance:**
- The `h1` starts with `Today`; the `.card` containing **Left to spend today** has a `.stat-value`; the **Side pot** `.stat-value` reads e.g. `210.00 SAR` once settled (`data-settled="true"`). The smoke test reproduces the 05 worked example through the UI.
- The masthead equals `computeBalance(state, today)`; after "My balance right now is 5000" it reads `5,000.00` under the eyebrow **Main balance**.
- Every unlogged day in the window is listed until it is confirmed or gets a daily entry; confirming re-counts the badge in the sidebar and the ribbon.
- All figures come from `derived` (engine) and every write goes through `run()`; nothing here recomputes money.

## F3 — Transactions
- Dateline `12 TRANSACTIONS · CYCLE 27 SEP – 26 OCT 2026` (or `ALL TIME`); actions **Export CSV** (the current filter; disabled when empty) and **Add transaction**.
- Filters in one hairline bar: **Cycle** (All time or a cycle), **Kind** (All / Daily / Non-daily / Income), **Category**, **Search notes**. Tiles **Spent**, **Income** and **Entries** total the filtered list.
- A **ledger** grouped by day, newest first: a mono day head `Sun 25 Oct 2026 · spent X · income Y`, then 36px rows with the category dot, category name, `Kind · note`, and the signed amount (`−` for spending, `+` for income). Edit and delete icons appear on hover or focus.
- Rows dated **before the first tracked day** carry the chip **– before tracking**, whose title says the entry doesn't affect the pot and points to **Extend tracking back** under Pot history.
- The add/edit dialog accepts any date up to today. When the date is before the first tracked day it shows the hint "Before your first tracked day — it won't affect the pot. Extend tracking back under Pot history."
- Deletes collapse the row and show an undo toast, which re-creates the item with the same id.
- Empty states: "No transactions yet" or "Nothing matches these filters" with **Clear filters**.

## F4 — Obligations
- Dateline `3 active bills · 1 archived · Oct 2026`; a 40px hero **Active total** (`per month · N bills the pot pays`) and a one-line reminder of the nearest-due rule.
- **Active bills** table: name, amount, due day (mono), months range (`Oct 2026 →`), category dot, this month's status as a chip with glyph and word (Paid / Skipped / Overdue / Due today / Upcoming, or the notes `from <month>`, `ended <month>`, `before tracking`), and **History / Edit / Archive / Delete**. **Archived / ending** lists bills whose end month has passed.
- CRUD fields: name, amount, due day (31 means the last day of shorter months), category, **first month to track** (hint shows the first due date; "Already paid this month? Start next month."), last month (optional), note.
- **Per-bill history:** the last 24 months up to next month, each with due date, chip, amount (paid rows show `pot X · main Y`) and **Pay / Skip**, or **Edit / Undo** for a settlement. Months due before the first tracked day read "Before tracking".
- **Pay dialog:** dateline + status chip, the bill amount, **Amount**, **Paid on** (any day from the first tracked day to today, else an error), note, and a **Split preview**: a two-segment cool/warm bar (`from pot` / `from main balance`) with the two figures and, when rule 4 applies, "X of the pot is set aside for bills due sooner". The preview runs `computePot` over a hypothetical state; it is display only and never stored. Saving shows the toast of F2.
- **Archive** follows 05 §2. **Delete** works only if the bill has no settlements, after a confirmation.

## F5 — Pot history
Dateline `CYCLE 27 SEP – 26 OCT 2026 · 30 DAYS · DAY 29 OF 30 · 2 UNLOGGED`. Header actions: the **Cycle** picker (newest first, current marked), **Confirm all unlogged in this cycle** (only while the cycle has unlogged days; one `confirmedDays` write per day, then "N days confirmed as spent nothing"; cycle-scoped, so unlogged days the sidebar badge counts in the previous week appear beside the strip chip as a link `N more unlogged days in <cycle> →` that switches the picker), and **Extend tracking back** (disabled with an explanation when there is no cycle or tracking already starts about 3 years back).

- **Day Strip** for the selected cycle, full width, same encoding as F2. Clicking a day scrolls to and highlights its row; unlogged cells open the **✓ Spent nothing / Add spending** popover (Add spending opens the transaction form dated that day). A chip shows `N unlogged days`, **✓ Every day accounted for**, or `starts <date>` for a future cycle.
- **Stats:** **Opening pot** ("Rolled over from the previous cycle"), **Pot now** / **Closing pot**, and the **Unlogged days** count.
- **Pot across the cycle:** an area chart of the pot after each day, warm below zero, with a dashed `today` line (today is projected).
- **Day by day**, newest first:

| Column | Shows |
|---|---|
| Date | mono date and weekday; chip `● today (projected)`, `? unlogged` or `✓ no spend` |
| Per-day | allowance for that day |
| Daily spent | total daily spending |
| Delta | allowance minus daily spent, with ▲/▼ |
| Bill payments | each payment as `Name amount · pot X` and `! main Y` when the pot fell short |
| Pot after | running balance (bold) |
| | unlogged rows: an inline **✓ Spent nothing** button |

This screen makes the pot **explainable**: every row is a `DayRow` from `computePot`.

**Extend tracking back** (05 §3, also reachable from Settings → Budget cycles), a dialog:
- **New start date**, bounded between today − 1096 days and the day before the first cycle; default one whole cycle back (the payday on or before that day). Validation (`validateExtendBack`) and any `FUTURE_DATE` / `INVALID` answer from main are shown on this field, not as a toast.
- **Per-day for the added days (SAR)**, prefilled with the first cycle's per-day. Closed cycles can't be edited afterwards, so it's chosen once.
- **Mark the added days as spent nothing** (default on): the sub-text says how many days would be confirmed, or how many would show as unlogged and keep adding the full per-day.
- **Mark past bill months as skipped (paid before tracking)** (default on): the sub-text counts the unsettled bill months in the added range, or warns that without it they show as overdue and lower safe-to-spend.
- **Preview** (`planExtendBack` and `computePot` over the would-be state): `PREVIEW · 10 DAYS · 1 CYCLE`, the list of cycles that will be created plus the current first cycle "unchanged", an info banner when a short cycle fills the gap before a mid-month first cycle, and the pot effect sentence: "The pot on <first cycle start> stays at 0.00" or "starts at +X instead of 0.00: the added days' per-day minus the daily spending already recorded on them, less any bill payments dated in that range."
- **Extend tracking** sends `cycle:extendBack`; the toast reads "Tracking now starts on <date>".

**Acceptance:** the e2e case extends a 3-day-old first cycle by 10 days at 70.00 with both options on, then checks **Pot now** = 910.00, the old first cycle's **Opening pot** = 700.00 and the dashboard pot = 910.00.

## F6 — Savings goals
- Dateline `2 active goals · 1 reached · 1 archived`; **Show archived**; **New goal**. A 40px hero **Saved across goals** (the net-worth savings figure, `counted in your net worth`).
- **Poster cards:** name and `by <date>`, chips **Reached** / **archived**, the saved amount at 40px over `of <target> · N%`, a 10px meter (ok once reached), and the note: `goal reached`, `target date passed · X to go`, `save about X per month to reach it by <date>` (05 §7) or `X to go · no target date`.
- **Actions:** **Add money**, **Withdraw** (stored as a negative contribution, "money moved back to your main balance"), **History** (entries with delete), **Edit**, **Delete** (confirmation; cascades; suggests archiving instead).
- **Archived = closed** (05 §10): the edit form's Archived checkbox says the goal stops counting in net worth, which drops by the amount saved, while its contributions stay recorded as cash that left the main balance; record a withdrawal first to keep the money counted.
- Empty state: a jar illustration and **New goal**.

## F7 — Investments
- Dateline `3 holdings · 1 archived · valued by hand`; tiles **Net invested**, **Current value**, **Gain / loss** (▲/▼, signed, percent on net invested; archived holdings are excluded from the totals).
- **Holdings table:** name · symbol (archived chip when closed), paired bars invested vs value, net invested, current value with its basis note (`as of <date>`, `estimated — update value`, `no valuation yet`, `closed`), gain/loss with glyph and percent, and **Buy / Sell / Update value / History / Edit / Delete** (collapsed into a `⋯` menu under 1100px).
- **Per holding:** a buy or sell (amount, optional quantity, date ≤ today; the dialog says it is cash leaving or returning to the main balance), **Update value** (value as of a date), history (buys, sells, valuations, each deletable), delete with confirmation (cascades; suggests archiving).
- **Archived = closed** (05 §10): the edit form says the holding stops counting in net worth, which drops by its current value, and leaves the portfolio totals; its buys and sells stay as cash that left the main balance.
- Prices are entered by hand by design ([ADR-0005](decisions/0005-no-network-no-auto-update.md)).

## F8 — Reports
- Dateline `Cycle 27 Sep – 26 Oct · 30 days · through 25 Oct`; a **Cycle** picker over the cycles that have started.
- **KPI row:** **Cycle budget**, **Daily spend**, **Bills paid**, **Cash flow** (signed), each with a ▲/▼ delta `vs previous`.
- **Cycle summary** (05 §6) for the selected cycle, compared with the previous cycle: opening pot, closing pot / pot now, cycle budget, daily and non-daily spending, income, bills paid with the indented `↳ from the pot` / `↳ from main balance`, saved to goals, invested (net), cash flow; deltas carry ▲/▼ and a colour judged by direction; a note counts payments that needed the main balance.
- **Spending by category:** horizontal bars stacked daily / non-daily.
- **Daily spending vs per-day:** a bar per day with the dashed per-day line and ▲ above over-budget days.
- **Pot balance over time:** the last 120 days, warm below zero; today's point is the projected pot and is marked so in the tooltip and table, as on Pot history.
- **Main balance over time** (new): `balanceSeries(state, today, 120)`, in credit cool / overdrawn warm. Unanchored, the subtitle reads `Change since <date> · not a bank balance until you set yours` and the card offers **Set your balance** (the F2 dialog).
- **Cycle over cycle:** the last 6 cycles' daily spend, pot at end and bills from main.
- **Portfolio:** net invested vs current value per holding.

Every chart card has a rule header, a legend with swatches, a **Show table** toggle, and draws once behind a curtain when the page mounts; changing the cycle re-renders without replaying. Charts show text values alongside the bars and lines, use the duotone palette, and work in both themes. Empty: "Reports appear once your first cycle has started".

## F9 — Settings
One editorial form; each section is an eyebrow and title on a 2px rule with a label column (and its help text) on the left and the controls on the right.
- **General:** currency (display only), **theme** as three labelled swatches **Match Windows / Light / Dark** (a radiogroup; the selected one carries a ✓), payday with **Save** and a preview of the next two cycles.
- **Balance** (05 §10): a chip **✓ Anchored** ("At the start of 27 Aug 2026 your main balance was 8,500.00 SAR.") or **? Not set** ("The dashboard shows the change since <date>, not a bank balance."), the balance today, **Set balance** / **Update balance** (the F2 dialog) and **Clear anchor** (confirmation, then `settings:update` with `balanceAnchor: null`). A **Why it can drift** row restates the re-anchoring rule.
- **Budget cycles** (05 §3): **Extend tracking back…** (the F5 dialog) and a table of every cycle, newest first: start (chips **Current** / **Upcoming**), end, days, per-day, opening pot, closing pot (`open` for the current cycle). Closed cycles can't be edited.
- **Categories:** add, rename, recolour, archive or restore, for expense and income categories.
- **PIN lock:** set, change (requires the current PIN) or remove; **Lock now**; auto-lock after N idle minutes (Off, 1–60) when a PIN is set. DailyPot also locks on the Windows lock screen.
- **Backups & data:**
  - **Export everything (JSON)** through a save dialog. This updates `lastExportAt`; the last export date is shown.
  - **Import…** through an open dialog chosen in main:
    1. Validate the file.
    2. Show a summary (counts and date range).
    3. Confirm "replaces all data".
    4. Write a `pre-import` backup.
    5. Replace the data.
  - **Export transactions (CSV)**.
  - Automatic backups table (file, saved, size) with **Restore**. Restore asks for confirmation and writes a `pre-restore` backup first. **Open backups folder**.
- **About:** a colophon with the version, license, data folder path, and a GitHub button that opens the system browser (hardcoded URL).

## F10 — PIN lock
- When a PIN is set, the app opens on the lock screen: `DailyPot is locked`, eight **PIN boxes** that fill per digit (the real `PIN` input sits over them, so typing and screen readers work), a helper line (`Type 4 to 8 digits, then press Enter.` / `N of up to 8 digits`) and a full-width **Unlock** button enabled from 4 digits.
- **Wrong PINs:** delays grow 1s, 2s, 4s… up to a 30s cap, enforced in main; the screen shows `! Wrong PIN`, a mono countdown `Try again in 3s`, and shakes (not under reduced motion). The backoff resets when the app restarts. That's acceptable for a privacy screen, and it's documented.
- **Auto-lock:** idle time comes from `powerMonitor.getSystemIdleTime()`, and the app also locks on the `lock-screen` event.
- **No recovery:** the lock screen says so, and explains that deleting `security.json` removes the PIN. This is a privacy screen, not encryption ([07](07-threat-model.md) T4).

## API surface (preload → main IPC contract)
| Channel | Payload (strict zod) | Returns |
|---|---|---|
| `state:get` | – | `AppState` + `meta` {`readOnly`, `restoredFromBackup`, `recoveryNeeded`, `dataPath`, `version`, `today`, `locked`, `pinSet`} |
| `entity:upsert` | `{ collection ∈ allowlist (05 §2), item }` | `AppState` |
| `entity:delete` | `{ collection ∈ allowlist, id }` | `AppState` |
| `settings:update` | `Partial<{currency, payday, theme, autoLockMinutes, balanceAnchor: {date, amount} \| null}>` (`null` clears the anchor; `date` ≤ today; 05 §10) | `AppState` |
| `setup:complete` | `{ settings, dailyAllowance, firstCycleStart, obligations[], pin? }` | `AppState` |
| `cycle:setAllowance` | `{ dailyAllowance }` (current cycle) | `AppState` |
| `cycle:startNextEarly` | `{ startDate }` | `AppState` |
| `cycle:extendBack` | `{ startDate, dailyAllowance, confirmDays, skipPastBills? }` (05 §3 "Extend tracking back"; `startDate` ≤ today) | `AppState` |
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
