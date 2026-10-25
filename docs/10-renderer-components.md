# 10 — Renderer components: the Broadsheet atoms

> The implementation reference for [09-design-system.md](09-design-system.md). Page agents build from this file: every hook, atom, class and animation pattern below exists in `src/renderer/src/` and compiles under strict TypeScript + ESLint (react-hooks + React Compiler rules). Where this file and 09 disagree, 09 wins; file a note in [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).

Non-negotiables (block merge): no money math or business rules in React (every figure comes from `@shared/engine`, pure functions of `(state, today)`); money is integer minor units rendered only through `<Money>`, `<Count>`, `formatAmount`/`formatMoney`; dates are `YYYY-MM-DD` strings handled only with `@shared/dates` (never `new Date('YYYY-MM-DD')`); every write goes through `window.dailypot.*` via `run()` from `state/app`; no new dependencies, web fonts, CDN or network; no `dangerouslySetInnerHTML`; every screen keeps empty / loading / error states; keyboard operable; every control labelled; colour never the only signal; contrast from the tokens only; user text (names, notes) through `<UserText>`.

Page-specific CSS goes **only** in `src/renderer/src/styles/pages/<name>.css`, imported from the page component (`import '../styles/pages/dashboard.css'`). Keep it small and token-based; never redefine a class from `app.css`.

---

## 1. Files

| File | What it holds |
|---|---|
| `styles/tokens.css` | All tokens (09 §2), three blocks, `color-scheme`, legacy aliases. Imported at the top of `app.css`. Never edit per page. |
| `styles/app.css` | The whole Broadsheet vocabulary (09 §4, §5, §7), keyframes, rail breakpoint, reduced-motion rules. |
| `hooks/usePrefersReducedMotion.ts` | `usePrefersReducedMotion(): boolean` |
| `hooks/useCountUp.ts` | `useCountUp()`, `CountScope`, `easeOutExpo` |
| `hooks/useVisit.ts` | `useVisit(active): number` |
| `components/ui.tsx` | `Money Count Field useMoneyField MoneyInput Modal Confirm Toasts Empty ProgressBar UserText` (kept) + `Chip Stat Widget Seg IconButton Delta Dateline PageHead Banner Cols FoldLine`, plus `displayAmount`, `MINUS`, `CSSVars`, `Tone`, `ColSpec` |
| `components/viz.tsx` | `Ring DayStrip StackedBar Spark Curtain ChartBox` + types `StripDay StripState BarSegment SparkPoint` |
| `components/Charts.tsx` | `SERIES AXIS GRID REF_LINE ZERO_LINE compact Tip Legend ChartCard useChartAnim` + types `TipEntry TableSpec ChartAnim` |
| `state/app.tsx` | `AppProvider useApp useReady newId`, `Derived` (now with `balance`, `netWorth`, `unlogged`) |
| `App.tsx` | Shell (sidebar, indicator, badges, footer), `Router`, `PageKey` |

Import paths from a page: `'../components/ui'`, `'../components/viz'`, `'../components/Charts'`, `'../hooks/useCountUp'`, `'../state/app'`, `'@shared/engine'`, `'@shared/money'`, `'@shared/dates'`.

---

## 2. State: what `useReady()` gives you

```ts
const { state, derived, meta, run, toast } = useReady()
// derived: Derived — memoised per payload; never recompute these in a page
interface Derived {
  today: string                 // meta.today, YYYY-MM-DD
  cycles: Cycle[]               // sorted
  current: Cycle | undefined    // cycle covering today
  pot: PotResult                // computePot(state, today)
  balance: BalanceResult        // computeBalance(state, today): { anchored, since, balance, flows }
  netWorth: NetWorth            // netWorth(state, today): { cash, savings, investments, total, anchored }
  unlogged: DayRow[]            // unloggedDays(pot, current ? addDays(current.startDate, -7) : undefined, today), NEWEST first, [] without a pot
  categories: Map<string, Category>
  currency: string
}
```

Everything else is a direct engine call with these inputs, e.g. `safeToSpend(pot, current, today)`, `dashboardBills(pot, current, today)`, `balanceSeries(state, today, 30)`, `cycleSummary(state, pot, cycle, today)`, `spendingByCategory(state, from, to)`, `goalFigures(state, goal, today)`, `holdingFigures(state, holding, today)`, `portfolioTotals(rows)`, `anchorForBalanceNow(state, today, balanceNow)`, `planExtendBack(...)`, `validateExtendBack(cycles, newStart, today)`. Memoise a heavy call with `useMemo` keyed on `derived` fields (destructure first; see §9 "React Compiler").

Writes: `await run(window.dailypot.upsert('confirmedDays', { id: newId(), date }), 'Day confirmed')`. `run` applies the returned payload, toasts errors (`INVALID / FUTURE_DATE / NOT_SET_UP / LOCKED`) and returns `undefined` on failure, so `if (!ok) return`.

---

## 3. Hooks

### 3.1 `usePrefersReducedMotion(): boolean`
Live `matchMedia('(prefers-reduced-motion: reduce)')`. Use it to skip JS-driven motion (ink drop, shake, Recharts). CSS motion is already disabled globally under the media query. Never hard-code `isAnimationActive`.

### 3.2 `useCountUp(target, opts?) → { value, text, settled }`
```ts
useCountUp(target: number, opts?: { duration?: number /*900*/; delay?: number /*0*/; id?: string; from?: number })
// value: integer minor units on screen · text: formatAmount(value) · settled: value === target and the loop stopped
```
- rAF loop, `value = from + (target − from) × easeOutExpo(t)`, rounded to integer minor units, snaps exactly to `target`, cancels on unmount.
- **From 0 on mount.** Later target changes on the same mount (quick add, pay, skip) count from the value last shown. With an `id`, the last shown value is also stored in the enclosing `<CountScope>` (the Shell renders one per page visit), so a figure that remounts inside the page (a re-sorted row) continues instead of restarting.
- Reduced motion → returns `target` immediately, `settled: true`. Hidden window → rAF stops; on return it snaps. Open dialog (`[aria-modal="true"]` in the DOM) → the count **pauses** without requesting frames (an event-driven gate, one DOM query per dialog open/close) and resumes from the shown value when the dialog closes, without re-applying `delay`. Therefore never count inside a `Modal`; use `<Money>` there.
- Also returns `from`, the value the current count started at; `<Count>` locks its width to the wider of `from` and `target`.
- **Never call this hook outside `components/ui.tsx`.** Pages render `<Count>` for money and `<Count integer>` for whole numbers (the payday countdown, entry counts): a page that hoists the hook re-renders its entire subtree (a ledger, a chart, the strip) on every frame of the count, while the atom re-renders only the numeral.

```tsx
<Count value={daysToPayday * 100} integer hero="secondary" from={cycleLength * 100} delay={500} duration={600} /> // minor-unit trick: ×100
<Count value={rows.length * 100} integer delay={370} duration={600} />
```

### 3.3 `useVisit(active: boolean): number`
Counts how many times `active` became true (starts at 1 when true on first render). The Shell does `const visit = useVisit(page === 'dashboard')` and renders `<Dashboard key={visit} />` so the dashboard remounts on every entry. Pages mount fresh on navigation anyway; use `useVisit` only if you need a replay key inside a page.

### 3.4 `CountScope`
`<CountScope>` from `hooks/useCountUp` provides the per-visit memory map for `id`s. The Shell wraps `<main>`'s page in `<CountScope key={`${page}:${visit}`}>`. Pages never render their own.

---

## 4. Atoms in `components/ui.tsx`

### 4.1 `Money` (kept)
`<Money value={minor} currency?="SAR" signed? className? />` → `<span class="num [neg|pos]">1,234.50<span class="faint"> SAR</span></span>`. Negatives render with a true minus (U+2212) and `.neg` **always**; `signed` adds `+` and `.pos` for positives. Text content: `1,234.50 SAR`. Use it for every static money figure (tables, dialogs, tooltips).

### 4.2 `Count` — the counting numeral
```tsx
<Count value={minor} currency?="SAR" signed? hero?={true | 'secondary'} id?="pot" delay?={300} duration?={900} from?={minor} className? />
```
- Default: `<span class="count num [neg|pos]" data-settled="true|false">…</span>`; after settling the text is **exactly** `<Money>`'s (`210.00 SAR`). Put it inside `.stat-value`, `.tile-hero`, a table cell or a sentence.
- While counting: the digits are `aria-hidden`, an `.sr-only` sibling holds the final value, and the digit box is width-locked (`min-width` = the wider of the start and final strings in `ch`) so nothing reflows mid-count; at settle the lock drops to 0 and `.count-digits` eases to its natural width over `--dur-2`.
- `integer` renders a whole number (`value / 100`, no minor units, no currency) with the same markup and locking; use it instead of calling `useCountUp`.
- `hero` → `.hero-value` (clamp 48–72px) split into integer part, `.hero-minor` (`.60` at 0.42em, `--text-2`) and `.cur` (`SAR`, mono 11px). `hero="secondary"` → the same split at 40px `.hero-2`. `data-len="long"` is set automatically when the integer part has ≥ 8 digits (forces 48px).
- `delay` = the widget's choreography start (09 §6, "figures start at 150ms + widget delay"); `duration` default 900.
- `id`: give every dashboard figure a stable id (`'hero-balance'`, `'pot'`, `'left-today'`) so re-counts after a save start from the previous value.

```tsx
<Stat label="Side pot" value={<Count value={pot.balance} currency={currency} id="pot" delay={330} />}
      sub={<>Pot after today <Money value={pot.projected} /> · opened this cycle at <Money value={opening} /></>} />
```

### 4.3 `Stat`
`<Stat label value sub? tone?={'pos'|'neg'|'warn-text'} ruled? className? />` → `<div class="stat"><span class="stat-label [ruled]">…</span><span class="stat-value [tone]">…</span><span class="stat-sub">…</span></div>`. The e2e tests locate `.card` containing the label text and read `.stat-value`, so **`label` must be exactly** `Left to spend today` and `Side pot` on the dashboard. `ruled` puts the eyebrow on the 2px rule (use when the card has no `.card-title`).

### 4.4 `Widget` — a bento cell
```tsx
<Widget span={8} spanCompact={12} index={0} variant?={'card'|'masthead'|'flat'} title?="Bills" subtitle? actions? className? id?>
  …children…
</Widget>
```
Renders `<section class="widget card|masthead|flat" style="--span:8;--span-c:12;--i:0"><div class="widget-body">[card-title]children</div></section>`. Only `.widget-body` animates (`rise`, 360ms, delay `150ms + i × 45ms`), so borders never flash. `title` as a string becomes `<h2>` on the 2px rule (`.card-title`); pass a node to render your own head. `variant="masthead"` = the rule band with no box (09 §4.4); `flat` = no box at all (the command bar, the nudge footer).

Spans (09 §6): the `span` column is used ≥ 1100px, `spanCompact` below. Reading-order `index` 0…13.

### 4.5 `Chip`
`<Chip tone?={'ok'|'warn'|'danger'|'info'|'neutral'|'accent'} glyph?="✓" pop? delay? title?>Paid</Chip>` → `<span class="chip ok [pop]"><span class="glyph" aria-hidden>✓</span>Paid</span>`. The word stays a plain text node, so `getByText('Due today')` keeps matching. Default glyphs: ok ✓ · warn ● · danger ! · info → · neutral – · accent ●; pass the one 09 specifies (`→ Upcoming`, `– Skipped`, `? unlogged`, `! Overdue`, `● Due today`, `✓ Paid`). `pop` plays the 260ms `--ease-pop` entrance after `delay` ms (the ring's "All bills funded" chip at 1000ms).

### 4.6 `Delta`
`<Delta value={minor} lowerIsBetter? currency? />` → `▲ +240.00` in `.pos` / `▼ −80.00` in `.neg`; `lowerIsBetter` flips the colouring (spending went down = good); zero → neutral `— 0.00`. Use in the Reports summary table, the pot "vs opening" chip area and the investments gain.

### 4.7 `Dateline`, `PageHead`
```tsx
<PageHead dateline={`${weekdayShort(today).toUpperCase()} ${formatDate(today, true).toUpperCase()} · DAY ${dayNo} OF ${len} · PAYDAY IN ${n} DAYS`}
          title={<>Today · {formatDate(today, true)}</>}
          actions={<><button className="btn">Change per-day</button></>} />
```
`PageHead` is the sticky glass header (`<header class="page-head"><div><p class="dateline">…</p><h1>…</h1></div><div class="row">actions</div></header>`). The dashboard `h1` **must begin with `Today`**; other pages use the page name and put context in the dateline (`CYCLE 27 SEP – 26 OCT · 31 DAYS`). Cycle pickers go in `actions` as `<Field label="Cycle"><select className="input">`. `Dateline` alone renders `<p class="dateline">` for in-card datelines (strip popover, ledger head).

Below the head, the page's first block starts with `<div className="rule" />` (or the `rule` class on it) unless it is the masthead.

### 4.8 `Seg`, `IconButton`, `Banner`
- `<Seg label="Kind" options={[{ value: 'daily', label: 'Daily' }, …]} value={kind} onChange={setKind} />` → `.seg[role=group]` with `aria-pressed` buttons. Generic over the value type.
- `<IconButton label="Delete" tone?="danger" size?="sm" onClick>{<Trash2 size={16} aria-hidden />}</IconButton>` → `.btn.ghost.icon-btn` with `aria-label` + `title`.
- `<Banner tone={'info'|'warn'|'danger'|'ok'} role?="status" actions?>message</Banner>` → `.banner.tone` with a leading glyph (ℹ ⚠ ! ✓) in an aria-hidden span; text is body text, never status-coloured.

### 4.9 Kept atoms
`Field`, `useMoneyField`, `MoneyInput`, `Modal`, `Confirm`, `Toasts`, `Empty`, `UserText` are unchanged. `ProgressBar` gained optional `tone={'accent'|'ok'|'warn'|'neg'}`, `anim` (grow from the left) and `delay` (ms): `<ProgressBar value={funded / amount} label={`${name} funded`} tone={overdue ? 'neg' : 'accent'} anim delay={800} />`. Always state `x / y` in words beside it.

### 4.10 Helpers
`displayAmount(minor)` = `formatAmount` with U+2212 (for SVG labels and plain strings). `MINUS`. `CSSVars` = `CSSProperties & Record<`--${string}`, string | number>` for inline custom properties: `style={{ '--t0': '600ms', '--j': i } as CSSVars}` (or type the variable as `CSSVars`).

### 4.11 `Cols`, `FoldLine` — the folding ledger (09 §4.12)
Every `.table` sits in a `.table-wrap` (a size container) and declares its columns, so it can never be wider than its container and always fills it:
```tsx
<div className="table-wrap">
  <table className="table hx-table">
    <Cols cols={[160, ['num', 1], 'num', ['delta', 2], 'auto', 'num']} />   {/* px · preset · [preset, fold level] · auto */}
    <thead><tr><th>Date</th><th className="r" data-fold="1">Per-day</th>…</tr></thead>
    <tbody><tr>
      <td>…primary cell… <FoldLine level={1}>per-day <Money value={d.allowance} /></FoldLine></td>
      <td className="r" data-fold="1"><Money value={d.allowance} /></td>…
    </tr></tbody>
  </table>
</div>
```
- Widths: `num` (112px, `−10,000,000.00`), `delta` (128px), `date` (96px, mono `2026-10-24`), `actions` (`--col-actions`, narrowing to `--col-actions-1` at 880px and `--col-actions-2` at 620px; set them per table on `.table.x`, e.g. `.table.bills-table { --col-actions: 160px; --col-actions-1: 104px; }`), a px number, a `%` string, or `auto` (shares what the fixed columns leave). Long dates and date + chip cells declare their own px.
- Folding: `[width, 1]` hides the column at `@container (max-width: 880px)`, `[width, 2]` at `620px`; put `data-fold` on the `<th>` and every `<td>` of that column too, and render the same information in the row's primary cell with `<FoldLine level>`. Only one copy is ever displayed (the other is `display: none`), so nothing is duplicated for assistive tech. Render a shared node once (`const fromPot = …`) and place it in both spots.
- Row actions go in `<span className="cell-actions">`: one line at full width, stacked when the `actions` column narrows. Text cells wrap; `.num`, `td.r`, `.delta` and `.chip` never wrap. Never set `overflow-x: auto` on a `.table-wrap`; `tests/e2e/layout.spec.ts` fails any page, card, widget or dialog whose `scrollWidth` exceeds its width at 900, 1200 and 1440.

---

## 5. Visuals in `components/viz.tsx`

### 5.1 `Ring` (09 §6.4)
```tsx
<Ring value={A > 0 ? spent / A : 0} over={A > 0 ? Math.max(0, (spent - A) / A) : 0} marker={safeDaily < A ? safeDaily / A : null}
      label={`Spent ${formatAmount(spent)} of ${formatAmount(A)}`} size={148} stroke={10} delay={220} duration={800}>
  <span className="stat-label">Left to spend today</span>
  <span className={`stat-value ${A - spent < 0 ? 'neg' : ''}`}><Count value={A - spent} currency={currency} id="left-today" delay={220} /></span>
</Ring>
```
Inline SVG (`role="img" aria-label`): track `--surface-2`, fill arc `--accent` drawn by `stroke-dashoffset` from `delay`; `over > 0` turns the fill `--neg` and adds the 3px outer overflow arc; `marker` draws the 2px `--warn` tick with a 9px mono `safe` label (fades in near the end). Children are centred over the ring (`.ring-centre`). Reduced motion: arcs appear at their final value. Note the e2e tests read `.stat-value` inside the `.card` that contains the text `Left to spend today`, so keep that structure.

### 5.2 `DayStrip` (09 §6.3)
```ts
type StripState = 'fed' | 'confirmed' | 'drew' | 'unlogged' | 'today' | 'future'
interface StripDay { date: ISODate; state: StripState; label: string; delta?: number; spent?: number }
<DayStrip days={days} onPick?={(date, state) => go('pot', { date })} onConfirm?={(date) => confirm(date)} onAdd?={(date) => prefillQuickAdd(date)}
          legend?={true} progress?={{ done: dayNo, total: len }} cell?={24} delay?={350} label?="Cycle days" />
```
Build `days` with **`stripDaysFor(rows, cycle, today)` from `components/stripDays.ts`** (the dashboard ribbon and Pot history both do; never map `DayRow`s by hand, so the two pages can't disagree). Its rule: `date > today → 'future'`; `!closed → 'today'`; `unlogged → 'unlogged'`; `confirmed && spent === 0 → 'confirmed'` (a day confirmed as spent nothing that later received an entry is fed/drew, never the no-spend dot); `delta < 0 → 'drew'`; else `'fed'`. Labels, one wording per state: `Tue 14 Oct, upcoming` · `…, today, spent 12.00 so far` · `…, unlogged, added your full per-day 70.00 to the pot` · `…, spent nothing, 70.00 to the pot` · `…, spent 52.00, 18.00 to the pot` / `… from the pot`. Unit-tested in `stripDays.test.ts`.

- Cells: `<button class="strip-cell fed|confirmed|drew|unlogged|today" aria-label title data-date>` for interactive states, `<span class="strip-cell future" aria-hidden>` for future days. Shape encoding is in CSS (solid cool · cool with surface dot · hollow with warm 2px border and ▲ · warm dotted with ? · ink outline · surface-2).
- Unlogged cells: when `onConfirm` or `onAdd` is given they open a popover (`.strip-pop`, `role="group"`, referenced by the cell's `aria-expanded` + `aria-controls`; no `aria-haspopup`, it is not a menu) with `✓ Spent nothing` (accessible name `Spent nothing`) and `Add spending`; Escape, choosing either action, or clicking outside closes it, and Escape or an action puts focus back on the cell (which survives as `confirmed`). Without those handlers every interactive cell calls `onPick(date, state)`.
- Cells stamp in with `--d` × 18ms from `delay`; today pulses once; `progress` renders `.strip-progress` (2px hairline, ink segment grows); `legend` renders `.strip-legend` with the glyph key.
- Confirming a day: call `run(window.dailypot.upsert('confirmedDays', { id: newId(), date }))`; the new payload re-renders the cell `unlogged → confirmed` (the colour cross-fades over 220ms via the `.strip-cell` transition).
- Smaller previews (setup, extend-back dialog): `cell={14} legend={false} delay={0}`.

### 5.3 `StackedBar` (09 §6.2, §6.6)
```ts
interface BarSegment { key: string; label: string; value: number /*minor, |value| = width*/; color: string /*token*/; hatched?: boolean }
<StackedBar segments={[{ key: 'cash', label: 'Cash', value: cash, color: 'var(--series-1)', hatched: cash < 0 },
                       { key: 'savings', label: 'Savings', value: savings, color: 'var(--series-3)' },
                       { key: 'inv', label: 'Investments', value: investments, color: 'var(--series-5)' }]}
            total?={sum} height?={10} labels?={false} delay?={400} stagger?={80} label?="Net worth composition" />
```
Inline SVG (`role="img"`, summary from the segments or `label`), squared, 2px `--surface` gaps, segments `scaleX` 0→1 left to right from `delay`, `stagger` apart. `hatched` segments are drawn with 1px ink hatching **left of a 2px ink zero tick** (negative cash). `labels` prints name (eyebrow) + amount (mono) under at most five segments ≥ 6% wide; put everything else in the legend / table toggle. Fixed colour orders are mandatory: net worth `s1 · s3 · s5`; cycle flow spent segments on the ink ramp (`var(--ink)`, `var(--ink-2)`, `var(--ink-3)`) and kept segments `Invested s5 · Saved s3 · Left s1`.

Pair it with `<Legend items={[{ label: 'Cash', color: 'var(--series-1)' }, …]} />` from Charts or your own rows (swatch + name + `<Money>`).

### 5.4 `Spark` (09 §6.1, §6.5)
```tsx
<Spark data={balanceSeries(state, today, 30)}            // Array<{ date: ISODate; value: number }>  — map { date, balance } → { date, value }
       height={56} begin={300} duration={900} currency?={currency} references?={[{ y: cumulative, label: 'Internet · 3 Nov' }]} dot?={true} name?="Balance" curtain?={true} />
```
Recharts `AreaChart`, no axes, zero line in `--ink`, stroke 2px and 0.18→0 fill that switch from cool (`--series-1`, above zero) to warm (`--series-2`, below) exactly at the zero crossing (a split gradient does the pos/neg work; you pass one `value`). `references` draw dashed labelled thresholds (the pot's next unfunded bill). `dot` marks the last point with a 2px `--surface` ring. `currency` enables the `Tip` tooltip (date label + value). It renders its own `ChartBox` with a curtain synced to `begin`, so just drop it in the widget. Heights: 56 masthead, 72 pot.

### 5.5 `ChartBox`, `Curtain`
```tsx
<ChartBox height={220} curtain delay={700} duration={800}>
  <ResponsiveContainer width="100%" height="100%"><BarChart …/></ResponsiveContainer>
</ChartBox>
```
`ChartBox` fixes `height` + `min-height` (Recharts' zero-size first frame never shows) and overlays one `Curtain` (`.curtain`: `--surface` sheet, `scaleX` 1→0 from the right over `duration`, after `delay`). `Curtain` returns `null` under reduced motion. Inside a `.masthead` or `.flat` widget the curtain is `--bg`-coloured automatically.

---

## 6. Charts in `components/Charts.tsx`

- `SERIES`: `['var(--series-1)', …, 'var(--series-6)']`. Use by meaning, never cycled: 1 cool/kept/under, 2 warm/spent/over, 3 teal (pot at end, current value, savings), 4 gold, 5 violet (investments in net worth), 6 raspberry. Never adjacent: s1–s5, s2–s4, s2–s6. Max three chromatic series per chart; status colours never in charts.
- `AXIS` (`--text-3`, 11px, no lines), `GRID` (`--grid`, horizontal only), `REF_LINE` (dashed 2px ink: per-day line, thresholds), `ZERO_LINE` (1px ink), `compact(minor)` tick formatter.
- `useChartAnim(begin?, duration?)` → `{ isAnimationActive, animationDuration, animationEasing: 'ease-out', animationBegin }` honouring reduced motion. Spread onto `<Bar>`, `<Area>`, `<Line>`: `const anim = useChartAnim(700, 700); <Bar dataKey="spent" {...anim} />`. Durations: 700 bars, 900 lines/areas. `begin` = the widget's start (`150 + i × 45` ms, or the figure in 09 §6).
- `Tip` (`currency` required; identity by swatch, text in text tokens), `Legend items={[{ label, color, dashed?, hatched? }]}`.
- `ChartCard` (kept API + `height?` default 260, `curtain?` default true, `begin?`, `actions?`): rule header with `h2`, optional legend, chart/table toggle (`Show table` / `Show chart`), curtain reveal. Reports headings keep their exact text (`Daily spending vs per-day`, `Pot balance over time`, `Cycle over cycle`, `Spending by category`, `Portfolio`).

Recipe for a dashboard chart (replays on entry, not on data change — key the chart root by nothing, the page remounts per visit):
```tsx
const anim = useChartAnim(700, 700)
<Widget span={8} index={9} title="Spending rhythm" subtitle="This cycle vs your per-day">
  <Legend items={[{ label: 'under per-day', color: SERIES[0] }, { label: 'over per-day', color: SERIES[1] }, { label: 'per-day', color: 'var(--ink)', dashed: true }]} />
  <ChartBox height={220} delay={700}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ right: 8 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="day" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={compact} width={44} />
        <Tooltip content={tip} cursor={{ fill: 'var(--surface-2)' }} />
        <ReferenceLine y={allowance} {...REF_LINE} label={{ value: 'per-day', position: 'insideTopRight', fill: 'var(--text-3)', fontSize: 10 }} />
        <Bar dataKey="spent" name="Spent" maxBarSize={22} radius={[2, 2, 0, 0]} {...anim}>
          {rows.map((d) => <Cell key={d.date} fill={d.future ? 'var(--surface-2)' : d.spent <= d.allowance ? SERIES[0] : SERIES[1]} stroke={d.future ? 'var(--border)' : undefined} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </ChartBox>
</Widget>
```
Reports: animate **once per page mount** only. `const reduced = usePrefersReducedMotion(); const [animate, setAnimate] = useState(!reduced)` and set `animate` false in the cycle picker's `onChange`, then `isAnimationActive={animate}` (or `{...useChartAnim()}` with `isAnimationActive={animate && anim.isAnimationActive}`), `curtain={animate}` on `ChartCard`.

---

## 7. Layout: bento, spans, stagger

```tsx
<div className="page">
  <PageHead dateline={…} title={<>Today · {formatDate(today, true)}</>} actions={…} />
  <div className="bento">
    <Widget span={8}  index={0} variant="masthead">…</Widget>            {/* 1 Masthead */}
    <Widget span={4}  index={1} title="Net worth">…</Widget>              {/* 2 */}
    <Widget span={12} index={2}>…Day Strip ribbon…</Widget>              {/* 3 */}
    <Widget span={4} spanCompact={6}  index={3}>…Today ring…</Widget>     {/* 4 */}
    <Widget span={4} spanCompact={6}  index={4}>…Pot…</Widget>            {/* 5 */}
    <Widget span={4} spanCompact={12} index={5}>…Cycle flow…</Widget>     {/* 6 */}
    <Widget span={12} index={6} variant="flat" className="command-bar">…quick add…</Widget>  {/* 7 */}
    <Widget span={unlogged.length ? 8 : 12} index={7} title="Bills">…</Widget>              {/* 8 */}
    {unlogged.length ? <Widget span={4} index={8} title="Unlogged days">…</Widget> : null}  {/* 9 */}
    …
  </div>
</div>
```
- `.bento` = 12 columns, 16px gaps; `.widget` spans `--span` (≥ 1100px) or `--span-c` (< 1100px). Widgets get `contain: layout style` (not `paint`, so popovers inside a widget are never clipped).
- Row groups that need 28px between them: add a spacer widget-free `div` with `grid-column: 1 / -1; height: 12px`.
- Stagger pattern inside a widget: give each list row `className="row-anim"` and `style={{ '--t0': '600ms', '--j': i } as CSSVars}` → rises at `t0 + j × 40ms` (09 §6.8 bills from 600ms, goals from 750ms). Use `row-anim from-left` for the unlogged items (slide from the left, 09 §6.9). Table rows: put the class and style on `<tr>`. Row exit: toggle `collapse-out` (200ms) before the re-render; "Mark paid" flash: `flash-paid`.
- A status bar on a table row: `<tr style={{ '--status': 'var(--neg)' } as CSSVars}>` paints the 2px inset bar on the first cell.
- Breakpoints you must check: 1440 (wide), 1200 (standard), 900–1099 (compact, rail sidebar). No horizontal scroll: grid tracks are `minmax(0, 1fr)`, flex children `min-width: 0`, tables are folding ledgers (§4.11) inside `.table-wrap`.

Choreography timeline (09 §7.2) for the dashboard: widget i rises at `150 + i × 45` ms; its figures start then (`delay` on `Count`); charts `begin` then; rows `--t0` = that + ~100; chips `pop` at ~1000ms; everything settles by ≈ 1.2s. The timings in 09 §6 per widget are authoritative.

---

## 8. Class vocabulary (what `app.css` gives you)

Kept (tests select on some of them): `.shell .sidebar .brand .brand-mark .nav-btn .sidebar-foot .main .page .page-head .row .row-between .stack .grid .grid-2 .grid-4 .card .card-title .stat-label .stat-value .stat-sub .banner(.info|.warn|.danger|.ok) .empty .btn(.primary|.ghost|.danger|.sm|.block|.icon-btn) .field .input .seg .table(.r|.mono) .table-wrap .chip(.ok|.warn|.danger|.info|.accent|.neutral|.pop) .bar(.big|.neg|.warn|.ok|.anim) .dot .list .list-item .day-head .overlay .modal .modal-actions .toasts .toast .center-screen .panel .steps .pin-input .quick-add .chart-box .chart-tip .legend .swatch(.hatched) .num .mono .muted .faint .pos .neg .warn-text .sr-only .err`.

New: `.eyebrow(.ruled) .dateline .rule .masthead .hero .hero-value .hero-minor .cur .hero-2 .ledger .live-dot .bento .widget(.flat) .widget-body .tiles .tile .tile-hero .ring .ring-track .ring-fill .ring-over .ring-tick .ring-centre .spark .curtain .strip-wrap .strip .strip-slot .strip-cell(.fed|.confirmed|.drew|.unlogged|.today|.future) .strip-pop .strip-legend .strip-key .strip-progress .flow .flow-seg .flow-label .flow-amount .flow-tick .command-bar .receipt .receipt-body .ink-drop .flash .count .count-digits .row-anim(.from-left) .collapse-out .flash-paid .nav-list .nav-indicator .nav-badge .nav-label .sidebar-meta .backup-dot(.warn) .section-head .poster(.reached) .poster-head .pin-boxes .pin-box(.filled|.active) .shake .delta .glyph .stat`.

Typography roles: `.eyebrow`/`.stat-label`/`th` 11px caps · `.dateline` mono 11px caps · `.faint` 12px · table 13px/36px rows · body 14px · `h2` 16px · `.section-head h2` 20px display · `.stat-value` 28px display · `h1` 28px display · `.hero-2` 40px · `.hero-value` clamp(48–72px). Numerals are tabular wherever `.num`, `.stat-value`, `.hero-*`, `.table`, `.dateline`, `.ledger`, `.receipt` apply.

Surfaces: `.card` (hover border only; never lift), `.masthead` (rule band), `.card-title`/`.section-head`/`.stat-label.ruled`/`th` (2px rule), `.page-head` (the only glass), `.banner` (3px status bar), `.chip` (glyph + word), `.bar` (ramp track), `.dot` (ink ring for category colours), `.ledger` (two-column mono), `.tiles > .tile` (eyebrow + `.tile-hero` on one hairline row), `.command-bar` (rules top and bottom, amount input 22px), `.receipt` (one-line mono confirmation; add `<button class="btn sm ghost">Undo</button>`), `.poster` (goal cards), `.pin-boxes > .pin-box.filled/.active` (lock screen), `.shake` (wrong PIN), `.steps > div.on` (wizard).

Ink drop (09 §6.7): render `<span className="ink-drop" style={{ transform: `translate(${x0}px, ${y0}px)` }} />` at the amount field's rect, then on the next frame set the pot figure's rect; it transitions `transform` 500ms `--ease-pop` and you remove it after ~600ms. Skip when `usePrefersReducedMotion()` is true (CSS also hides it). Quick-add flash: toggle `flash` on the amount `.input` for 400ms.

---

## 9. Rules of the road

- **Engine only.** `A − spentToday`, `spent / A`, `funded / amount`, day numbers (`diffDays`), payday countdowns: trivial arithmetic on engine outputs for display is fine; any *rule* (what counts as unlogged, what is safe to spend, how a bill splits) comes from `@shared/engine`. If a figure you need does not exist there, stop and write it in OPEN-QUESTIONS; do not approximate in React.
- **Money text** only via `Money`, `Count`, `formatAmount`, `formatMoney`, `displayAmount`. Dates via `formatDate`, `weekdayShort`, `addDays`, `diffDays`, `dateRange` from `@shared/dates`.
- **React Compiler lint** (`react-hooks` 7 recommended) is on: do not read `ref.current` during render; do not call setState synchronously in an effect body (schedule with rAF or derive during render); when you `useMemo` over `derived`, destructure first — `const { current: cycle, pot, today } = derived` — because `derived.current` is otherwise treated as a ref read; no `any`; unused vars prefixed `_`.
- **Reduced motion** is handled for you: CSS animations/transitions are off, `Count` settles instantly, `useChartAnim` turns Recharts off, `Curtain` renders nothing. Your only duty: skip JS-driven motion (ink drop, shake, scroll-into-view smooth) when `usePrefersReducedMotion()` is true.
- **Accessibility**: every button has a name (icon-only → `IconButton`); every input a `<Field label>` or `aria-label`; chips carry glyph + word; deltas ▲/▼ + sign; meters state `x / y` in words; charts with ≥ 2 series have a legend with swatches **and** a table toggle; `role="status" aria-live="polite"` for receipts and nudges that appear after an action; user text via `<UserText>` (never uppercase or tracked).
- **Dialogs** use `Modal` (Tab/Shift+Tab trap, `#root` made `inert` while any dialog is open, Escape, `aria-modal`, focus restored to the opener; its focus effect runs once per mount, so pass `onClose` inline freely); never put `Count` inside one. The quick-add receipt keeps its `role="status"` element mounted and toggles only its content.
- **Empty / loading / error**: every widget and page defines them (`<Empty title>` or a `.muted` sentence with the recovery action); the dashboard without a current cycle keeps the warn banner `No budget cycle covers today…`.

---

## 10. E2E-sensitive names and texts (do not change)

- Navigation: `<nav aria-label="Main">` with buttons named exactly `Dashboard`, `Transactions`, `Bills`, `Pot history`, `Savings goals`, `Investments`, `Reports`, `Settings` (badges are `aria-hidden`; counts go through `aria-describedby`). `.main` is the scroll container (showcase scrolls it).
- Dashboard: `h1` begins with `Today`; a `.card` containing the exact text `Side pot` whose `.stat-value` reads `210.00 SAR` after settling; a `.card` containing `Left to spend today` whose `.stat-value` contains `45.00`; quick-add `Amount (SAR)` inside a `form`, Enter submits; bill rows are `<tr>` containing the bill name, the chip text `Due today`, a `Mark paid` button; the pay toast text `from pot 80.00 SAR · from main balance 0.00 SAR`.
- Setup: heading `Welcome to DailyPot`, labels `Payday`, `Start tracking from`, `Per-day (SAR)`, `Name`, `Amount`, `Due day`, text `past day(s) with no entries`, buttons `Next`, `Add bill`, `Start using DailyPot`, placeholders `Phone`, `80`, `5`.
- Lock: heading `DailyPot is locked`, `getByLabel('PIN')` must reach the real input, texts `Wrong PIN`, `Try again in Ns`, button `Unlock`.
- Recovery: heading `Your data file couldn’t be read`, button `Start fresh` (page and dialog).
- Reports card headings: `Daily spending vs per-day`, `Pot balance over time`, `Cycle over cycle`, `Spending by category`, `Portfolio`.
- `[data-settled="true"]` on `.count` lets tests wait for the choreography. The smoke test's one-shot `innerText` read of the pot value must become `await expect(card.locator('.stat-value')).toHaveText('210.00 SAR')` (09 §9.6).

---

## 11. Worked example: the Masthead widget

```tsx
import { Fragment, useMemo } from 'react'
import { balanceSeries } from '@shared/engine'
import { formatDate } from '@shared/dates'
import { Count, Money, Widget, type CSSVars } from '../components/ui'
import { Spark } from '../components/viz'
import { useReady } from '../state/app'

export function Masthead({ onAnchor }: { onAnchor: () => void }): React.JSX.Element {
  const { state, derived } = useReady()
  const { balance, currency, today } = derived
  const series = useMemo(() => balanceSeries(state, today, 30).map((p) => ({ date: p.date, value: p.balance })), [state, today])
  const f = balance.flows
  const lines: Array<[string, number]> = [
    ['Income', f.income], ['Spending', -(f.daily + f.nonDaily)], ['Bills', -f.bills], ['Saved', -f.goals], ['Invested', -f.investments]
  ]
  return (
    <Widget span={8} index={0} variant="masthead">
      <div className="row-between">
        <span className="stat-label">{balance.balance < 0 ? 'Main balance (overdrawn)' : balance.anchored ? 'Main balance' : `Change since ${formatDate(balance.since ?? today)}`}</span>
        <span className="row faint"><span className="live-dot" aria-hidden="true" /> as of today, recalculated from your history</span>
      </div>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="hero">
          <Count value={balance.balance} currency={currency} hero id="hero-balance" delay={150} />
          <Spark data={series} height={56} begin={300} currency={currency} />
        </div>
        <div className="ledger">
          {balance.anchored && state.settings.balanceAnchor ? (
            <><span className="row-anim" style={{ '--t0': '450ms', '--j': 0 } as CSSVars}>Anchor {formatDate(state.settings.balanceAnchor.date)}</span>
              <span className="row-anim" style={{ '--t0': '450ms', '--j': 0 } as CSSVars}><Money value={state.settings.balanceAnchor.amount} /></span></>
          ) : null}
          {lines.map(([label, v], j) => (
            <Fragment key={label}>
              <span className="row-anim" style={{ '--t0': '450ms', '--j': j + 1 } as CSSVars}>{label}</span>
              <span className="row-anim" style={{ '--t0': '450ms', '--j': j + 1 } as CSSVars}><Money value={v} signed /></span>
            </Fragment>
          ))}
          <span /><button className="btn sm ghost" onClick={onAnchor}>{balance.anchored ? 'Adjust anchor' : 'Set anchor'}</button>
        </div>
      </div>
    </Widget>
  )
}
```
(`netFlow` is available if you need the signed total; the ledger above shows each flow signed as cash in/out.) Urgent banners (`meta.readOnly`, `meta.restoredFromBackup`) render directly after this widget as `<Widget span={12} index={1} variant="flat"><Banner tone="danger">…</Banner></Widget>`.
