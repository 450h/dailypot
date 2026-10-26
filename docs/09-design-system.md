# 09 — Design system: "Broadsheet"

> Single source of truth for the DailyPot UI. Implementers work from this file alone. Where it conflicts with the current `src/renderer/src/styles/app.css`, this file wins. Money rules, IPC and schema are unchanged and live in [05-data-model.md](05-data-model.md), [04-architecture.md](04-architecture.md) and the ADRs; nothing here touches them.

Hard constraints (unchanged): Electron 44 · React 19 · TypeScript strict · Recharts 3 · lucide-react · **no new dependencies**, **system fonts only**, **no network**, CSS + inline SVG + Recharts. Light and dark themes (system preference unless overridden in Settings). WCAG 2.2 AA. Window min 900×640, typical 1200×820 to 1440×900.

---

## 1. Concept

DailyPot becomes a daily **financial broadsheet**: warm paper (deep ink in dark mode), hairline column rules, and one oversized Segoe UI Variable Display numeral per page that you can read from across the room. The page you open every morning is a **masthead, not a pot report**: the live main balance leads at 64–72px under a mono dateline, net worth sits beside it, and the day strip, today's ring, pot, bills and goals are set below like columns on a well-edited front page.

One electric **ultramarine** is the only "colour" in the chrome. Every chart is a **warm/cool duotone**: cool (ultramarine) = fed the pot / under budget / kept; warm (burnt orange) = drew from it / over budget / spent. Polarity reads instantly, and because lightness steps carry as much as hue, the series stay distinct under deuteranopia.

Every time you enter the dashboard the page **"goes to print"**: figures count up, the pot line draws itself, the day strip stamps in square by square, bill rows settle with a 45ms stagger, all in about one second, all on `transform`/`opacity`, so it stays at 60fps. It still behaves like a calm tool: squared corners, no lift-on-hover, every status has a glyph **and** a word, numbers are tabular, high-contrast and never coloured alone.

### What this fixes for the owner
| Complaint | Where it lands |
|---|---|
| 1. Unlogged days can't be marked after the pop-up disappears | The **Unlogged days** widget (never disappears while a day is unlogged), every unlogged **Day Strip** cell is a button, and Pot history rows carry an inline "Spent nothing" button (§6, §8) |
| 2. Total balance does not show | The **Masthead** leads with the live main balance (ADR-0007, `computeBalance`) and a 30-day balance sparkline; **Net worth** beside it (§6) |
| 3. Cycle ranges can't be modified to add past details | Pot history gets **"Extend tracking back"** (`cycle:extendBack`, already in the engine/IPC) in the page head, and Transactions/Bills dialogs accept back-dated entries within the tracked range (§8) |
| Dashboard is pot-centric, static, bland | Masthead + net worth + cycle flow lead; 15 widgets animate in on every entry (§6, §7); the whole chrome changes (§3–§5) |

---

## 2. Tokens

Tokens are CSS custom properties on `:root`. Keep the existing three-block structure (`:root`, `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])`, `:root[data-theme='dark']`), the `color-scheme` declarations, and the `data-theme` handling in `state/app.tsx`. The framework names `styles/tokens.css`; put the token blocks there and `@import` it at the top of `app.css` (or keep them in `app.css`: either satisfies DEVELOPMENT-FRAMEWORK §7).

Legacy aliases **must stay** so existing selectors keep working during the migration: `--danger: var(--neg)`, `--danger-2: var(--neg-2)`, `--shadow: var(--shadow-1)`, `--font: var(--font-text)`.

### 2.1 Light (default)

```css
:root {
  /* page + surfaces */
  --bg: #f2efe8;
  --bg-2: radial-gradient(900px 480px at 18% -10%, rgba(30, 63, 240, 0.07), transparent 60%),
          linear-gradient(180deg, #f6f4ee 0%, #f2efe8 38%, #eeeae1 100%);
  --surface: #fbfaf7;
  --surface-2: #e9e5db;
  --surface-glass: rgba(251, 250, 247, 0.74);
  --overlay: rgba(20, 19, 17, 0.55);
  /* lines */
  --border: #d6d0c2;          /* hairlines: decorative only */
  --border-strong: #827c6f;   /* control boundaries: inputs, selects, seg, checkbox (>= 3:1) */
  --ink: #141311;             /* 2px rules, reference lines, ink ramp step 1 */
  --ink-2: #67635b;           /* ink ramp step 2 (fills) */
  --ink-3: #a39d91;           /* ink ramp step 3 (fills) */
  --rule: 2px solid var(--ink);
  /* text */
  --text: #141311;
  --text-2: #49463f;
  --text-3: #67635b;
  /* accent */
  --accent: #1e3ff0;
  --accent-2: #e1e6ff;
  --accent-text: #ffffff;
  --accent-glow: rgba(30, 63, 240, 0.26);
  /* status */
  --pos: #136d43;  --pos-2: #d9f1e2;
  --neg: #b8261a;  --neg-2: #fbe2dd;  --neg-text: #ffffff;
  --warn: #7d5200; --warn-2: #faeacb;
  --info: #0c6472; --info-2: #d6edf2;
  --focus: #1e3ff0;
  --focus-halo: var(--bg);
  /* data series (fixed order, never cycled) */
  --series-1: #1e3ff0;  /* ultramarine: cool / kept / under */
  --series-2: #c2410c;  /* burnt orange: warm / spent / over */
  --series-3: #078fa2;  /* teal */
  --series-4: #b87309;  /* gold */
  --series-5: #6a4fd6;  /* violet */
  --series-6: #b5375a;  /* raspberry */
  --grid: #dcd7cb;
  /* depth */
  --shadow-1: 0 1px 0 rgba(20, 19, 17, 0.05), 0 1px 3px rgba(20, 19, 17, 0.07);
  --shadow-2: 0 18px 40px -20px rgba(20, 19, 17, 0.28), 0 2px 6px rgba(20, 19, 17, 0.06);
  --noise-opacity: 0.035;
  --noise-blend: multiply;
  /* shape */
  --radius-lg: 6px;
  --radius: 4px;
  --radius-sm: 2px;
  /* type */
  --font-display: 'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif;
  --font-text: 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
  --font-small: 'Segoe UI Variable Small', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
  --mono: 'Cascadia Mono', Consolas, ui-monospace, monospace;
  /* motion */
  --dur-1: 120ms; --dur-2: 220ms; --dur-3: 360ms; --dur-4: 900ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-pop: cubic-bezier(0.34, 1.56, 0.64, 1);
  /* spacing (unchanged) */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px;
  /* legacy aliases */
  --danger: var(--neg); --danger-2: var(--neg-2); --shadow: var(--shadow-1); --font: var(--font-text);
  color-scheme: light;
}
```

### 2.2 Dark (both the `prefers-color-scheme` block and `[data-theme='dark']`)

```css
  --bg: #0f0f11;
  --bg-2: radial-gradient(900px 480px at 18% -10%, rgba(123, 140, 255, 0.10), transparent 60%),
          linear-gradient(180deg, #121214 0%, #0f0f11 40%, #0c0c0e 100%);
  --surface: #17171a;
  --surface-2: #202024;
  --surface-glass: rgba(23, 23, 26, 0.72);
  --overlay: rgba(0, 0, 0, 0.65);
  --border: #2a2a30;
  --border-strong: #757067;
  --ink: #f1ede4;
  --ink-2: #a9a497;
  --ink-3: #6f6a60;
  --rule: 2px solid var(--ink);
  --text: #f1ede4;
  --text-2: #bcb7ab;
  --text-3: #938e84;
  --accent: #7b8cff;
  --accent-2: #1b2250;
  --accent-text: #0b0e22;
  --accent-glow: rgba(123, 140, 255, 0.32);
  --pos: #4fcf8a;  --pos-2: #10301f;
  --neg: #ff7a6b;  --neg-2: #3a1612;  --neg-text: #0f0f11;
  --warn: #f2b544; --warn-2: #342a12;
  --info: #5ccbe0; --info-2: #0f2a30;
  --focus: #9fabff;
  --focus-halo: var(--bg);
  --series-1: #5a6dff; --series-2: #d96b2a; --series-3: #1fa3b3;
  --series-4: #b3860f; --series-5: #8b78e8; --series-6: #d14d78;
  --grid: #26262b;
  --shadow-1: 0 0 0 1px rgba(255, 255, 255, 0.04);
  --shadow-2: 0 20px 48px -20px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05);
  --noise-opacity: 0.05;
  --noise-blend: screen;
  color-scheme: dark;
```

Everything not listed in 2.2 (radii, fonts, motion, spacing, aliases) is inherited from `:root`.

### 2.3 Verified contrast (WCAG 2.x relative luminance)

Recomputed with a node script over the final values above (scratch script, not shipped). Rule: body text ≥ 4.5:1, large numerals (≥ 24px) ≥ 3:1, non-text (control boundaries, focus rings, meter fills, chart marks) ≥ 3:1. **Every non-decorative pair passes in both themes; the worst is 3.30 (control boundary on `--surface-2`), the worst text pair is 4.75 (`--text-3` on `--surface-2`, light).**

| Use | Light pair | Light | Dark pair | Dark | Min |
|---|---|---|---|---|---|
| Body text on bg / surface / surface-2 | `#141311` on `#f2efe8` · `#fbfaf7` · `#e9e5db` | 16.17 · 17.79 · 14.76 | `#f1ede4` on `#0f0f11` · `#17171a` · `#202024` | 16.39 · 15.31 · 13.90 | 4.5 |
| Secondary text, eyebrows, hero minor units | `#49463f` on bg · surface · surface-2 | 8.20 · 9.02 · 7.48 | `#bcb7ab` on bg · surface · surface-2 | 9.57 · 8.94 · 8.12 | 4.5 |
| Tertiary text, dateline, axis ticks | `#67635b` on bg · surface · surface-2 | 5.21 · 5.73 · **4.75** | `#938e84` on bg · surface · surface-2 | 5.87 · 5.49 · 4.98 | 4.5 |
| Primary button label | `#ffffff` on `#1e3ff0` | 6.94 | `#0b0e22` on `#7b8cff` | 6.40 | 4.5 |
| Accent as text (nav current, links) | `#1e3ff0` on bg · surface | 6.05 · 6.65 | `#7b8cff` on bg · surface | 6.42 · 5.99 | 4.5 |
| Accent chip / pressed segment | `#1e3ff0` on `#e1e6ff` | 5.61 | `#7b8cff` on `#1b2250` | 5.06 | 4.5 |
| Pos / Neg / Warn / Info chips | on their `-2` tints | 5.35 · 5.11 · 5.75 · 5.60 | on their `-2` tints | 7.25 · 6.33 · 7.72 · 7.94 | 4.5 |
| Neutral chip (`--text-2` on `--surface-2`) | | 7.48 | | 8.12 | 4.5 |
| Pos / Neg / Warn / Info as text on surface | | 6.10 · 6.04 · 6.53 · 6.53 | | 9.05 · 7.03 · 9.77 · 9.43 | 4.5 |
| Pos / Neg / Warn / Info as text on bg | | 5.55 · 5.49 · 5.94 · 5.93 | | 9.69 · 7.52 · 10.46 · 10.10 | 4.5 |
| Error toast text (`--neg-text` on `--neg`) | `#ffffff` on `#b8261a` | 6.31 | `#0f0f11` on `#ff7a6b` | 7.52 | 4.5 |
| Inverted toast, count badge (`--bg` on `--text`) | | 16.17 | | 16.39 | 4.5 |
| Secondary text on accent tint | `#49463f` on `#e1e6ff` | 7.60 | `#bcb7ab` on `#1b2250` | 7.55 | 4.5 |
| Focus ring on bg / surface | `#1e3ff0` | 6.05 · 6.65 | `#9fabff` | 8.88 · 8.30 | 3 |
| **Control boundary** on surface / bg / surface-2 | `#827c6f` | 3.97 · 3.61 · **3.30** | `#757067` | 3.64 · 3.89 · **3.30** | 3 |
| Accent fill (button, meter, ring arc) on surface / bg | `#1e3ff0` | 6.65 · 6.05 | `#7b8cff` | 5.99 · 6.42 | 3 |
| Accent fill on `--accent-2` track / `--surface-2` track | | 5.61 · 5.52 | | 5.06 · 5.44 | 3 |
| Pos / Neg / Warn fill on their `-2` track | | 5.35 · 5.11 · 5.75 | | 7.25 · 6.33 · 7.72 | 3 |
| Series 1–6 on surface | | 6.65 · 4.96 · 3.69 · 3.66 · 5.43 · 5.50 | | 4.32 · 5.19 · 5.92 · 5.40 · 5.07 · 4.30 | 3 |
| Series 1–6 on bg | | 6.05 · 4.51 · 3.35 · 3.33 · 4.94 · 5.00 | | 4.62 · 5.55 · 6.34 · 5.78 · 5.42 · 4.60 | 3 |
| Ink ramp step 2 fill on surface | `#67635b` | 5.73 | `#a9a497` | 7.19 | 3 |
| Ink ramp step 3 fill on surface (lightest ordinal step) | `#a39d91` | 2.58 | `#6f6a60` | 3.33 | 2 (ordinal light end) |
| 2px ink rule on surface | | 17.79 | | 15.31 | 3 |
| Hairline `--border` on surface (decorative) | | 1.47 | | 1.25 | n/a |
| Grid on surface (decorative) | | 1.38 | | 1.19 | n/a |

Changes from the proposal, forced by these numbers: `--border-strong` is now a **mid-tone control boundary** (`#827c6f` / `#757067`) and the 2px rules use the new `--ink`; the dark error toast uses `--neg-text` (`#0f0f11`), never white; light `--series-4` darkened to `#b87309` so it clears 3:1 on the page background too.

Focus ring on an accent-filled button is 1.0:1 against the fill by construction, so the ring **always** ships with a 2px `--focus-halo` under it (§9.1); the ring is then read against the halo (6.05 light / 8.88 dark).

### 2.4 Palette validation (dataviz validator, OKLab, Machado 2009 severity 1.0)

| Palette / order | Light | Dark |
|---|---|---|
| 6-slot categorical `--series-1..6` (adjacent pairs) | PASS, worst adjacent CVD ΔE 17.0 (gold↔teal), normal 22.4, L band 0.43–0.77, chroma ≥ 0.10 | PASS, worst 17.7 (raspberry↔violet), normal 20.5 |
| Net worth bar order **cash s1 · savings s3 · investments s5** | PASS, worst 14.8 | PASS, worst 10.3 |
| Investments pair **s1 · s3** | PASS, 20.3 | PASS, 17.3 |
| Reports "Cycle over cycle" order **s1 · s3 · s2** | PASS | PASS |
| Ink ramp `--ink`, `--ink-2`, `--ink-3` (ordinal) | PASS, monotone, light end 2.58 | PASS, light end 3.33 |

Orders that **failed** and are therefore forbidden: s1 next to s5 (ΔE 4.4), s2 next to s4 or s6 (normal-vision < 15), any five-chroma stack. That is why the Cycle flow bar (§6.6) colours the *spent* segments with the ink ramp and keeps chroma for what was *kept*. Never put more than three chromatic series on one scatter-like chart.

---

## 3. Typography

System fonts only; declared as tokens. `body { font: 14px/1.5 var(--font-text); font-optical-sizing: auto; -webkit-font-smoothing: antialiased; }`.

| Role | Size / line / weight / tracking | Family | Colour | Notes |
|---|---|---|---|---|
| Eyebrow (`.stat-label`, `.eyebrow`, `th`) | 11 / 1.2 / 600 / +0.12em UPPERCASE | `--font-small` | `--text-2` (never `--text-3` at 11px) | Replaces the old 12px `.stat-label` |
| Dateline (`.dateline`) | 11 / 1.3 / 500 / +0.08em UPPERCASE | `--mono` | `--text-3` | e.g. `SAT 25 OCT 2026 · DAY 12 OF 31 · PAYDAY IN 19 DAYS` |
| Meta (`.faint`) | 12 / 1.4 / 450 | text | `--text-3` | |
| Table body, dense lists | 13 / 1.45 / 450 | text | `--text` | 36px rows |
| Body | 14 / 1.5 / 400 | text | `--text` | |
| Card title (`h2`) | 16 / 1.3 / 600 | text | `--text` | sits on a 2px rule (§4.3) |
| Section headline | 20 / 1.25 / 650 / −0.01em | display | | |
| Stat value (`.stat-value`) | 28 / 1.1 / 600 / −0.02em | display | | Replaces 26px |
| h1 page headline | 28 / 1.1 / 650 / −0.02em | display | | preceded by the dateline |
| Secondary hero (`.hero-2`: net worth, payday countdown, goal saved, bills total) | 40 / 1.0 / 600 / −0.03em | display | | |
| **Hero** (`.hero-value`) | `clamp(48px, 5vw, 72px)` / 0.95 / 600 / −0.035em | display | | 72px at 1440, 60px at 1200, 48px at 900. `[data-len="long"]` (integer part ≥ 8 digits) forces 48px so `10,000,000.00` never wraps |

Weights: Segoe UI Variable has a 300–700 axis; use 400 / 450 / 500 / 600 / 650 only. `font-weight: 650` resolves on the variable font and rounds to 600 on static Segoe UI (Windows 10), which is acceptable.

### Numerals
- All money, dates in tables, axis ticks, counters: `font-variant-numeric: tabular-nums lining-nums` (`.num` already does this; apply it to `.stat-value`, `.hero-value`, `.hero-2`, `table.table`, `.dateline`).
- `.hero-value` and `.hero-2` split the amount: integer part at full size, **minor units at `0.42em` in `--text-2`** on the same baseline, then the currency code in `--mono` 11px uppercase `--text-3` (`<span class="hero-minor">.60</span> <span class="cur">SAR</span>`). The 28px `.stat-value` keeps the existing `<Money>` rendering unchanged (full-size minor units, currency in `.faint`) so its text content stays e.g. `210.00 SAR`.
- Negative values always carry a true minus **U+2212** *and* `--neg`; deltas carry **▲ / ▼** plus the sign; positive income carries `+`.
- Counting numerals lock their width: `min-width` of the **wider of the start and final strings** (in `ch`) while counting, because a re-count may lose a digit on the way (100.00 → 95.00); at settle the box eases to its natural width over `--dur-2`, so nothing reflows mid-count.
- User-entered text (names, notes; `dir="auto"` via `<UserText>`) never receives negative tracking or uppercase.

---

## 4. Surface language

### 4.1 Page
```css
html, body, #root { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); }
#root { position: relative; z-index: 1; height: 100%; }
.shell { background: var(--bg) var(--bg-2) no-repeat; background-size: 100% 100%; } /* gradient on the fixed-height shell, never background-attachment: fixed */
/* paper grain: one 160px SVG turbulence tile, rendered once, never animated, UNDER #root (cards are clean print) */
body::before {
  content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  opacity: var(--noise-opacity); mix-blend-mode: var(--noise-blend);
  background-size: 160px 160px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.6 0'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>");
}
```
CSP already allows `img-src 'self' data:` (renderer `index.html` and `main/protocol.ts`); nothing else changes in the CSP. The grain sits **under** `#root`, so it shows on page-background areas (sidebar, masthead band, command bar) and never over cards or text.

### 4.2 Cards
`.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-1); padding: 20px 20px 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }`
Hover: border-color → `var(--text-3)` over 160ms. **Cards never lift, scale or glow.** No inner cards, no zebra; inside a card use 1px hairlines only.

### 4.3 Rule header (the signature mark)
Every card title, table head and settings section sits on a **2px ink rule**:
```css
.card-title { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; padding-bottom: 8px; border-bottom: var(--rule); margin-bottom: 2px; }
.card-title h2 { font: 600 16px/1.3 var(--font-text); }
.card-title .eyebrow, .card-title .stat-label { align-self: center; }
.table thead th { border-bottom: var(--rule); }
.section-head { border-bottom: var(--rule); padding-bottom: 8px; }
```
Where a card has only a `.stat-label`, the label itself sits on the rule (`.stat-label.ruled { display:block; padding-bottom:6px; border-bottom: var(--rule); }`).

### 4.4 Masthead band (not a card)
`.masthead { border-top: var(--rule); border-bottom: 1px solid var(--border); padding: 18px 0 20px; background: transparent; }` The biggest number on the page has no box around it.

### 4.5 Glass: exactly one element
```css
.page-head { position: sticky; top: 0; z-index: 5; background: var(--surface-glass); backdrop-filter: blur(12px) saturate(1.2); border-bottom: 1px solid var(--border); margin: 0 -40px; padding: 14px 40px 12px; }
@media (prefers-reduced-transparency: reduce) { .page-head { background: var(--surface); backdrop-filter: none; } body::before { display: none; } }
```
Nothing else uses `backdrop-filter`. The modal overlay is plain `var(--overlay)`.

### 4.6 Depth
Light: `--shadow-1` on cards, `--shadow-2` on floating layers (modal, toasts, popovers). Dark: depth comes from borders; `--shadow-1` is a 1px 4% white ring, `--shadow-2` for floating layers.

### 4.7 Accent glow: three places only
1. `.btn.primary:hover, .btn.primary:focus-visible { box-shadow: 0 0 0 4px var(--accent-glow); }`
2. The hero live dot: `.live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 6px var(--accent-glow); }` with the pulse keyframe (§7).
3. The quick-add amount field flash after a successful save (§6.7).

### 4.8 Chips
```css
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: var(--radius-sm); font: 600 12px/1.4 var(--font-text); white-space: nowrap; border: 1px solid color-mix(in srgb, currentColor 35%, transparent); }
.chip.ok      { background: var(--pos-2);     color: var(--pos); }
.chip.warn    { background: var(--warn-2);    color: var(--warn); }
.chip.danger  { background: var(--neg-2);     color: var(--neg); }
.chip.info    { background: var(--info-2);    color: var(--info); }
.chip.accent  { background: var(--accent-2);  color: var(--accent); }
.chip.neutral { background: var(--surface-2); color: var(--text-2); }
```
A chip **always** carries a glyph in its own `<span class="glyph" aria-hidden="true">` before the word, so the word remains a plain text node (tests match `Due today`): `✓ Paid`, `● Due today`, `! Overdue`, `→ Upcoming`, `– Skipped`, `✓ no spend`, `? unlogged`.

### 4.9 Meters
`.bar { height: 6px; border-radius: var(--radius-sm); background: var(--accent-2); overflow: hidden; } .bar > div { height: 100%; background: var(--accent); transform-origin: left; } .bar.big { height: 10px; } .bar.neg { background: var(--neg-2); } .bar.neg > div { background: var(--neg); } .bar.warn { background: var(--warn-2); } .bar.warn > div { background: var(--warn); } .bar.ok > div { background: var(--pos); } .bar.ok { background: var(--pos-2); }`
Track = the lighter step of the **same** ramp as the fill; stacked segments keep a 2px `--surface` gap. `ProgressBar` keeps `role="progressbar"` + `aria-label`; the surrounding text always states `x / y` in words.

### 4.10 Buttons
`.btn { min-height: 34px; padding: 7px 14px; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface); color: var(--text); font-weight: 550; transition: background var(--dur-1), box-shadow 160ms; }`
`.btn:hover { background: var(--surface-2); } .btn:active { transform: scale(0.98); transition-duration: 90ms; }`
`.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); } .btn.primary:hover { filter: brightness(1.06); box-shadow: 0 0 0 4px var(--accent-glow); }`
`.btn.ghost { border-color: transparent; background: transparent; } .btn.ghost:hover { background: var(--surface-2); }`
`.btn.danger { color: var(--neg); border-color: var(--border-strong); } .btn.sm { min-height: 28px; padding: 3px 10px; font-size: 13px; } .btn:disabled { opacity: .55; cursor: not-allowed; }`

### 4.11 Inputs and controls
`.input, select.input, textarea.input { min-height: 34px; padding: 7px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface); color: var(--text); }`
`.input:focus-visible { outline: 2px solid var(--focus); outline-offset: -1px; border-color: transparent; } .input[aria-invalid='true'] { border-color: var(--neg); }`
`.seg { border: 1px solid var(--border-strong); border-radius: var(--radius); } .seg button + button { border-left: 1px solid var(--border-strong); } .seg button[aria-pressed='true'] { background: var(--accent-2); color: var(--accent); font-weight: 600; }`
Checkboxes: `accent-color: var(--accent)`; unchecked boxes get `outline: 1px solid var(--border-strong)` via `appearance` only if the native box fails 3:1 (Windows native boxes pass).
`.field > span` (the label) is the 11px eyebrow.

### 4.12 Tables
`table.table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums lining-nums; } .table th { 11px eyebrow; padding: 6px 10px 8px; border-bottom: var(--rule); text-align: left; white-space: nowrap; } .table td { padding: 8px 10px; height: 36px; border-bottom: 1px solid var(--border); vertical-align: middle; } .table tr:last-child td { border-bottom: 0; } .table tbody tr:hover td { background: var(--surface-2); } .table .r { text-align: right; } .table .mono { font-family: var(--mono); font-size: 12px; }`
Dates in tables are `--mono`.

**The folding ledger (no table ever scrolls sideways).** `.table-wrap { container-type: inline-size; overflow: visible; }` and `table.table { table-layout: fixed; width: 100%; }`, so a table can never be wider than its container; every table declares its columns with `<Cols cols={[…]} />` (docs/10 §4.11): px presets for numerals (`num` 112px fits `−10,000,000.00` at 13px tabular, `delta` 128px, `date` 96px, `actions`), explicit px or `%`, and `auto` columns that share whatever is left, so the table always fills its container exactly. A column may fold: its `<col>`, `<th>` and `<td>`s carry `data-fold="1"` (hidden at `@container (max-width: 880px)`) or `data-fold="2"` (hidden at `620px`), and the same information is rendered inside the row's primary cell as `<FoldLine level>` sub-lines (`.fold-line`: 12px, `--text-2`, numerals in mono), which are `display: none` until their column folds, so nothing is lost or duplicated for assistive tech. Text cells wrap (`overflow-wrap: anywhere`), numerals (`.num`, `td.r`, `.delta`, `.chip`) never wrap, headers ellipsise rather than spill (chart tables, `.chart-table`, wrap theirs to a second line instead, because series names such as "Bills from main" exceed the numeral preset). Row actions sit in `.cell-actions`, one line at full width and stacked once the `actions` column narrows at a fold (`--col-actions` → `--col-actions-1` / `-2`, overridden per table on `.table.x`; the Bills list wraps them into two lines of two instead). A capped-height `.table-wrap` scrolls vertically only (`overflow: hidden auto`). Verified by `tests/e2e/layout.spec.ts` at 900, 1200 and 1440 wide, with the viewport emulated over CDP so the host screen never clamps it.

### 4.13 Toasts
`.toast { background: var(--text); color: var(--bg); border-radius: var(--radius); box-shadow: var(--shadow-2); padding: 10px 14px; } .toast.error { background: var(--neg); color: var(--neg-text); } .toast button { border: 1px solid currentColor; border-radius: var(--radius-sm); background: transparent; color: inherit; }`

### 4.14 Banners / nudges
`.banner { border: 1px solid var(--border); border-left-width: 3px; border-radius: var(--radius); padding: 10px 14px; background: var(--surface); color: var(--text); display: flex; align-items: center; justify-content: space-between; gap: 12px; } .banner.info { border-left-color: var(--info); } .banner.warn { border-left-color: var(--warn); } .banner.danger { border-left-color: var(--neg); } .banner.ok { border-left-color: var(--pos); }`
The banner text is body text (`--text`), never a status colour; the status colour is the 3px left bar plus a leading glyph (`ℹ`, `⚠`, `!`, `✓`) in an `aria-hidden` span and the status word for assistive tech via `role="status"` where appropriate.

### 4.15 Where each surface is allowed
| Technique | Allowed on | Forbidden on |
|---|---|---|
| `backdrop-filter` | `.page-head` only | everything else |
| Gradient | `.shell` background (`--bg-2`), pot sparkline fill (`<linearGradient>`) | buttons, cards, text |
| Grain | `body::before` | anything animated |
| `--shadow-2` | `.modal`, `.toast`, popovers | cards, buttons |
| `--accent-glow` | primary button hover/focus, live dot, quick-add flash | everything else |
| Status colour as text | chips, `.pos/.neg/.warn-text`, deltas (always with glyph/sign) | banners, body copy |
| Category colours (user-chosen) | 10px `.dot` with a 1px `--ink` ring | bars, text, chips |

---

## 5. Shell, sidebar, page header, grid

Existing class names are **kept** (tests select on them): `.shell .sidebar .brand .brand-mark .nav-btn .sidebar-foot .main .page .page-head .row .row-between .stack .grid .grid-2 .grid-3 .grid-4 .card .card-title .stat-label .stat-value .stat-sub .banner .empty .btn .field .input .seg .table .table-wrap .chip .bar .dot .list .list-item .day-head .overlay .modal .modal-actions .toasts .toast .center-screen .panel .steps .pin-input .quick-add .chart-box .chart-tip .legend .swatch .num .muted .faint .pos .neg .warn-text .sr-only .err`.

New vocabulary: `.eyebrow .dateline .rule .masthead .hero .hero-value .hero-minor .cur .hero-2 .ledger .live-dot .bento .widget .widget-body .tile .tile-hero .ring .ring-track .ring-fill .ring-over .ring-tick .spark .curtain .strip .strip-cell .strip-legend .strip-progress .flow .flow-seg .command-bar .receipt .ink-drop .count .nav-indicator .nav-badge .backup-dot .rail .section-head .poster .pin-boxes .pin-box`.

### 5.1 Shell and sidebar
```css
.shell { display: grid; grid-template-columns: 232px 1fr; height: 100%; }
.sidebar { position: relative; background: var(--bg); border-right: 1px solid var(--border); padding: 18px 12px 14px; display: flex; flex-direction: column; gap: 2px; }
.brand { display: flex; align-items: center; gap: 10px; padding: 4px 10px 18px; font: 700 20px/1 var(--font-display); letter-spacing: -0.02em; }
.brand-mark { width: 24px; height: 24px; border-radius: var(--radius-sm); background: var(--ink); display: grid; place-items: center; }
.brand-mark::after { content: ''; width: 10px; height: 10px; background: var(--accent); }   /* the "pot" mark: pure CSS, no icon */
.nav-btn { position: relative; display: flex; align-items: center; gap: 12px; height: 36px; padding: 0 10px; border: 0; background: transparent; color: var(--text-2); font: 550 13px/1 var(--font-text); border-radius: var(--radius-sm); text-align: left; cursor: pointer; }
.nav-btn:hover { background: var(--surface-2); color: var(--text); }
.nav-btn[aria-current='page'] { color: var(--accent); background: transparent; }
.nav-indicator { position: absolute; left: 0; width: 2px; height: 36px; background: var(--accent); will-change: transform; transition: transform var(--dur-2) var(--ease-in-out); }
.nav-badge { margin-left: auto; min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--radius-sm); background: var(--text); color: var(--bg); font: 600 11px/18px var(--mono); text-align: center; }
.sidebar-foot { margin-top: auto; display: flex; flex-direction: column; gap: 2px; }
.backup-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pos); } .backup-dot.warn { background: var(--warn); box-shadow: 0 0 0 2px var(--warn-2); }
```
- The single `.nav-indicator` element moves with `transform: translateY(index * 38px)` (36px item + 2px gap); it is **not** the focus ring.
- Count badges (`.nav-badge`): Pot history shows the unlogged-day count (`unloggedDays(pot).length`, current cycle + previous 7 days), Bills shows the overdue count. Hidden when 0.
- Footer: `Lock now` (when a PIN is set), then a row with `.backup-dot` + mono 11px `--text-3` text `Backup 12d ago · v0.2.0` (`title` carries the full sentence; dot turns warn at ≥ 30 days or never exported). This gives the export nudge a permanent quiet home.
- **Rail** at viewport `< 1040px`: `.shell { grid-template-columns: 64px 1fr; }`, `.brand` shows the mark only, `.nav-btn` becomes a 40px square; its label text is wrapped in `<span class="nav-label">` which gets `.sr-only` styling in rail mode (keeps `getByRole('button', { name: 'Pot history' })` working) and the button gets `title={label}`.

### 5.2 Main and page
`.main { overflow-y: auto; min-width: 0; }` (the showcase test scrolls `.main`).
`.page { max-width: 1240px; margin: 0 auto; padding: 0 40px 72px; display: flex; flex-direction: column; gap: 16px; animation: fade-rise 260ms var(--ease-out) both; }` (rail mode: padding `0 24px 56px`).

### 5.3 Page header idiom ("dateline + headline")
```html
<header class="page-head">
  <div>
    <p class="dateline">SAT 25 OCT 2026 · DAY 12 OF 31 · PAYDAY IN 19 DAYS</p>
    <h1>Today · Sat 25 Oct 2026</h1>
  </div>
  <div class="row"> …page actions as .btn… </div>
</header>
```
- The dashboard `h1` text **must still begin with `Today`** (`Today · {formatDate(today, true)}`), the e2e tests look for `heading /^Today/`.
- Other pages: `h1` = page name; the dateline carries the context (`CYCLE 27 SEP – 26 OCT · 31 DAYS`, `12 TRANSACTIONS · 3,214.50 SAR`, etc.).
- The cycle picker on Pot history / Reports / Transactions lives in the header's action row (a `select.input`; optionally a `.seg` of the last three cycles + "Older…" select).
- Below the header, every page's first child starts with a 2px rule (`.rule { border-top: var(--rule); }`) unless it is the masthead (which has its own).

### 5.4 Grid
```css
.bento { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }
.bento > .widget { grid-column: span var(--span, 12); min-width: 0; contain: layout style; } /* not `content`: paint containment would clip the strip popover (OPEN-QUESTIONS D15) */
.grid { display: grid; gap: 16px; } .grid-2 and .grid-4 unchanged (minmax(0,1fr)); @media (max-width: 1000px) { .grid-4 { grid-template-columns: repeat(2, minmax(0,1fr)); } }
@media (max-width: 1099px) { .bento > .widget { grid-column: span var(--span-c, 12); } }
```
Widgets set `style={{ '--span': 8, '--span-c': 12, '--i': index }}`. Density: body 14px, tables 13px/36px rows, stat tiles 28px values + 11px eyebrows, masthead band ≈ 200px tall; 28px between row groups (`.bento` row gaps may use `row-gap: 28px` between declared row groups via wrapper `.bento-row` elements if simpler), 12px inside widgets.

### 5.5 Breakpoints (viewport width)
| | ≥ 1360 wide | 1100–1359 standard (1200 typical) | 900–1099 compact |
|---|---|---|---|
| Sidebar | 232px | 232px (rail below 1040) | 64px rail |
| Content width | up to 1128px (1440) | ≈ 888px (1200) | ≈ 740–790px |
| Hero | 72px | 60px (clamp) | 48px |
| Bento | 12 columns, `--span` | 12 columns, `--span` | 12 columns, `--span-c` |
| Quick add | one line | one line | wraps to two lines |
| Height < 720px | masthead padding 10px, ledger behind a `details` "Show breakdown" toggle | same | same |
No horizontal scroll anywhere: all tracks `minmax(0,1fr)`, flex children `min-width: 0`, tables are folding ledgers inside `.table-wrap` (§4.12).

---

## 6. Dashboard composition

Shell renders `<Dashboard key={visit} go={go} />` where `visit` increments every time `page` becomes `'dashboard'`, so the whole page remounts and the choreography replays on every entry. Each widget is `<section class="widget" style="--span:…;--i:…"><div class="widget-body">…</div></section>`; only `.widget-body` animates (§7.2) so borders never flash.

Spans below are for **1440 (wide)** / **1200 (standard)** / **compact**; `--i` is the stagger index in reading order.

| # | Widget | 1440 | 1200 | compact | `--i` |
|---|---|---|---|---|---|
| 1 | Masthead: live main balance | 8 | 8 | 12 | 0 |
| 2 | Net worth | 4 | 4 | 12 | 1 |
| 3 | Day Strip ribbon (cycle + payday) | 12 | 12 | 12 | 2 |
| 4 | Today ring | 4 | 4 | 6 | 3 |
| 5 | Pot and its trend | 4 | 4 | 6 | 4 |
| 6 | Cycle flow | 4 | 4 | 12 | 5 |
| 7 | Quick add command bar | 12 | 12 | 12 | 6 |
| 8 | Bills ledger | 8 (12 when no unlogged days) | 8 (12) | 12 | 7 |
| 9 | Unlogged days | 4 (hidden → badge in ribbon when none) | 4 | 12 | 8 |
| 10 | Spending rhythm | 8 | 8 | 12 | 9 |
| 11 | Savings goals | 4 | 4 | 12 | 10 |
| 12 | Investments | 6 | 6 | 12 | 11 |
| 13 | Where it went | 6 | 6 | 12 | 12 |
| 14 | Nudge footer (only when there is a nudge) | 12 | 12 | 12 | 13 |

Urgent banners (`meta.readOnly`, `meta.restoredFromBackup`) render directly **below the masthead** as `.banner.danger / .banner.warn`; non-urgent ones (new cycle started, last export ≥ 30 days, no export yet) go to the Nudge footer.

Data sources: `derived.pot` (`computePot`), `derived.current`, `safeToSpend`, `dashboardBills`, `unloggedDays`, `computeBalance`, `balanceSeries`, `netWorth`, `cycleSummary`, `spendingByCategory`, `goalFigures`, `holdingFigures`, `portfolioTotals`. Add `balance: computeBalance(state, today)` and `netWorth: netWorth(state, today)` to `Derived` in `state/app.tsx` (memoised with the pot) so widgets never recompute.

### 6.1 Masthead: live main balance
- **Shows:** `balance.balance` from `computeBalance` as of today. Eyebrow `Main balance` (anchored) / `Change since 27 Sep` (unanchored, with a `Set your balance` link that opens the anchor dialog: "My balance right now is …", stores `anchorForBalanceNow` via `updateSettings({ balanceAnchor })`). A pulsing `.live-dot` + `as of today, recalculated from your history`. Negative renders in `--neg` with U+2212 and the eyebrow becomes `Main balance (overdrawn)`. Right column: a 6-line **ledger** in `--mono` 12px tabular, two columns (label / signed amount): `Anchor 01 Oct  12,000.00` · `Income  +9,000.00` · `Spending  −3,214.50` · `Bills  −1,180.00` · `Saved  −500.00` · `Invested  −1,000.00`, then `Adjust anchor` / `Set anchor` as a `.btn.sm.ghost`. Under the hero: a **30-day balance sparkline** (`balanceSeries(state, today, 30)`), Recharts `AreaChart` 56px high, no axes, `--series-1` stroke 2px, fill gradient 0.18 → 0, `ReferenceLine y={0}` in `--ink`; negative region filled `--series-2` via a split dataKey (`pos`/`neg`).
- **Visual:** `.masthead` band (§4.4). Dateline above the rule, `.hero-value` with `.hero-minor` + `.cur`, ledger right-aligned, sparkline full hero width.
- **Animation:** `useCountUp` 900ms from 0, delay 150ms; ledger lines rise (opacity 0→1, translateY 6px→0) 320ms each, stagger 40ms from 450ms; sparkline Recharts `animationBegin={300} animationDuration={900}` plus a `.curtain` (§7.4); live dot pulses 2s (static under reduced motion).

### 6.2 Net worth
- **Shows:** `netWorth.total` at 40px (`.hero-2`), eyebrow `Net worth`; composition bar + legend rows: `Cash` (`--series-1`), `Savings` (`--series-3`), `Investments` (`--series-5`), each with swatch, name and tabular value; footnote `cash = main balance; goals and holdings count as money that left it` in 12px.
- **Visual:** `.card`; custom inline SVG stacked bar 10px high, 2px `--surface` gaps, squared ends, **fixed order cash · savings · investments** (validated adjacency, §2.4). Negative cash: a hatched segment (`<pattern>` of 1px `--ink` lines at 45°) drawn left of a zero tick.
- **Animation:** count-up in sync with the hero (same start); segments `transform: scaleX(0→1)` origin left, 600ms `--ease-out`, stagger 0/80/160ms from 400ms; legend rows rise 300ms stagger 40ms.

### 6.3 Day Strip ribbon (cycle progress + payday countdown)
- **Shows:** first row, left: eyebrow `Cycle 27 Sep – 26 Oct` + `Day 12 of 31` in 20px display; right: `19` at 40px `.hero-2` + eyebrow `days to payday`; actions `Change per-day` and `Salary arrived early?` (existing dialogs) as `.btn.sm`; when there are no unlogged days a `.chip.ok` `✓ Every day accounted for`. Second row, full width: the **strip**, one cell per cycle day (31 cells at 24px need ≈ 860px, so the strip never shares a row with the head and the countdown; under 1100px the three stack).
- **Cell encoding** (shape + colour, never colour alone):
  | State | Fill | Border / mark | Interactive |
  |---|---|---|---|
  | closed, delta ≥ 0 (fed the pot) | solid `--series-1` | none | button → opens Pot history on that day's cycle and scrolls to / highlights its row (`go('pot', { date })`) |
  | confirmed no-spend | solid `--series-1` | centred 4px `--surface` dot | same |
  | closed, delta < 0 (drew from pot) | `--surface` | 2px solid `--series-2` border + 8px `▲` glyph in `--series-2` | same |
  | unlogged | `--warn-2` | 1px dotted `--warn` border + `?` glyph 9px `--warn` | **button**: opens a 2-action popover `✓ Spent nothing` / `Add spending` (prefills quick-add date + focuses the amount) |
  | today | `--surface` | 2px solid `--ink` outline | button → focuses quick-add |
  | future | `--surface-2` | none | non-interactive `<span aria-hidden>` |
- **Visual:** `.strip { display: grid; grid-template-columns: repeat(var(--days), minmax(calc(var(--cell) - 4px), 1fr)); gap: 4px; }` (the track floor keeps the centre-to-centre pitch ≥ 24px even in a tight window; 3px gaps under the 1040px rail); `.strip-cell { width: 100%; max-width: var(--cell, 24px); height: var(--cell, 24px); border-radius: var(--radius-sm); }` (24px targets satisfy 2.5.8; ≥ 20px cells at a 24px pitch pass via its spacing exception). State borders use `border`, never `outline`: the focus ring (§9.1) is declared after every state rule and keeps drew/today's inset ring under the halo. Each cell `<button class="strip-cell" aria-label="Tue 14 Oct, spent 52.00, 18.00 to the pot" title="…">`. Under the strip: `.strip-progress` 2px hairline with an `--ink` segment for X/Y, and `.strip-legend` with glyph swatches: `■ fed the pot · ▲ drew from it · ? unlogged · ◻ today · ░ future`.
- **Animation:** cells stamp in (opacity 0→1, scale 0.6→1) 260ms `--ease-out`, stagger 18ms per day from 350ms (31 days ≈ 560ms); today's outline pulses once (`outline-offset 0→2px→0`, 400ms); the countdown counts from Y down to N over 600ms. Confirming a day cross-fades the cell from dotted-warn to solid cool over 220ms.

### 6.4 Today ring
- **Shows:** `Left to spend today` = `A − spentToday`; `Spent 42.00 of 70.00`; the safe-to-spend sentence (05 §5 wording, unchanged from today's Dashboard: all funded / safeDaily / unavoidable shortfall / fromMainNow).
- **Visual:** `.card` whose `.stat-label` is **exactly** `Left to spend today` and whose centre numeral is `.stat-value` (tests: `.card` containing that text, `.stat-value` contains `45.00`). Inline SVG ring 148px, stroke 10px, round caps, track `--surface-2`, fill arc `--accent` for `spent/A`; when `spent > A` the fill is `--neg` and a 3px outer arc shows the overflow fraction; a 2px `--warn` tick with a tiny `safe` label marks `safeDaily/A` when `safeDaily < A`. After the arc completes a `.chip` pops in: `✓ All bills funded` (ok) or `! Short by 310.00` (warn).
- **Animation:** `stroke-dashoffset` from full circumference to target, 800ms `--ease-out`, delay 220ms; centre count-up in sync; tick fades in at 900ms; chip `--ease-pop` 260ms at 1.0s.

### 6.5 Pot and its trend
- **Shows:** `.stat-label` **exactly** `Side pot`, `.stat-value` = `pot.balance` with currency (test reads `210.00 SAR` after settle); `.stat-sub`: `Pot after today 240.00 · opened this cycle at 0.00`; delta chip vs opening (`▲ +240.00` ok / `▼ −80.00` danger); sparkline of the last 30 `DayRow.balanceAfter`; **bill threshold**: a labelled `ReferenceLine y={nextUnfundedCumulative}` (`Internet · 3 Nov`) and the sentence `1,150.00 more to cover Internet` (or `Covers every bill this cycle`); link `How the pot was built →` (`go('pot')`).
- **Visual:** Recharts `AreaChart` in a 72px box, no axes/grid: `<Area type="monotone" dataKey="pos" stroke="var(--series-1)" strokeWidth={2} fill="url(#potFill)" />` + `<Area dataKey="neg" stroke="var(--series-2)" fill="url(#potFillNeg)" />` (split keys so deficit reads warm), `<ReferenceLine y={0} stroke="var(--ink)" />`, last point `activeDot r=4` with 2px `--surface` ring. Table toggle via `ChartCard`-style button (last 30 rows).
- **Animation:** `isAnimationActive={!reduced} animationDuration={900} animationEasing="ease-out" animationBegin={300}` + `.curtain`; number count-up; chip pops at 1.0s.

### 6.6 Cycle flow ("where income went")
- **Shows:** one stacked bar of this cycle's income (`cycleSummary`): `Daily | Non-daily | Bills | Invested | Saved | Left`, and the sentence `You kept 2,105.00 of 9,000.00 this cycle` (Left = income − daily − nonDaily − billsPaid − goalNet − investmentNet, clamped; if ≤ 0 the sentence becomes `You spent 310.00 more than you earned this cycle` in `--neg`). Empty state when income is 0: `No income logged this cycle yet`. **Net inflows:** a goal withdrawal or holding sale makes `goalNet` / `investmentNet` negative and cash flow larger than income. Only the bar clamps (`Invested`/`Saved` segments at 0, the cash shows as more `Left`); the legend prints the engine's **signed** figures (`Saved −500.00`), adds a `Returned` row (`from goals / holdings`) when that sum is > 0, and the sentence reads `You kept X of Y this cycle (incl. Z returned from goals or holdings)` with Y = income + returned, so X never exceeds Y.
- **Visual:** inline SVG bar 12px, 2px gaps; **spent** segments use the ink ramp (`Daily --ink`, `Non-daily --ink-2`, `Bills --ink-3`), **kept** segments use chroma in validated order (`Invested --series-5`, `Saved --series-3`, `Left --series-1`). Direct labels (name + amount, mono 12px) on at most five segments ≥ 6% wide; the rest only in the legend row and the table toggle.
- **Animation:** segments `scaleX` 0→1 in order, 500ms each overlapping (stagger 60ms) from 500ms; sentence fades in at 1.0s.

### 6.7 Quick add command bar
- **Shows:** `TransactionForm compact` unchanged in behaviour (kind seg, amount, category, note, date, Add; Enter saves; label `Amount (SAR)` stays).
- **Visual:** `.command-bar` strip bounded by 2px rules top and bottom, on the page background (no card); amount input 22px display tabular with mono currency suffix; `.seg` squared; hairline-bordered inputs (`--border-strong`); `.btn.primary` Add. After a save a one-line **receipt** appears under the bar for 8s: `Saved 35.00 · Coffee · pot after today 1,215.00  Undo` (Undo = `remove('transactions', id)`), replacing the old toast for quick-add.
- **Animation:** strip fades in at 500ms. On save: amount field `box-shadow 0 0 0 4px var(--accent-glow) → transparent` 400ms; for an **under-budget daily** save an **ink drop** (`.ink-drop`, a 10px `--accent` dot in a fixed div) travels from the amount field to the pot figure, transform-only, 500ms `--ease-pop`, then the pot/hero/ring figures re-count **from their previous values**; an over-budget save flashes the ring's warm overflow arc instead. Skipped entirely under reduced motion.

### 6.8 Bills ledger
- **Shows:** `dashboardBills` rows: name (`dir=auto`), due date (mono), amount, status chip (glyph + word), funding meter `540.00 / 600.00 funded` (mono 12px) or paid split `pot 600.00 · main 0.00`, `Mark paid` (`.btn.sm.primary`) and `Skip` (`.btn.sm.ghost`); footer `Due this cycle 1,180.00 · funded 940.00 · from main ~240.00` (`dashboardBillTotals` over the same rows: open rows only, `fromMainEstimate = max(0, due − funded)`); `Manage bills →`. The pay-dialog toast wording stays `from pot X · from main balance Y`.
- **Visual:** hairline table with the 2px-rule head; a 2px left bar in the status colour on each row (`td:first-child { box-shadow: inset 2px 0 var(--status) }`) paired with the chip; overdue meters use `.bar.neg`.
- **Animation:** rows rise (opacity, translateY 8px→0) 360ms stagger 40ms from 600ms; each row's meter `scaleX` 0→1 600ms, 200ms after the row lands; footer totals count up 700ms. Mark paid: the row flashes `--pos-2` 240ms, then the list re-renders sorted.

### 6.9 Unlogged days to confirm
- **Shows:** `unloggedDays(pot, addDays(current.startDate, −7), today)` newest first; each item: 2px `--warn` left bar, date in mono 13px, `added your full per-day 70.00 to the pot` 12px `--text-2`, actions `Add spending` (ghost: prefills quick-add date, focuses amount) and `✓ Spent nothing` (primary sm: `upsert('confirmedDays', { id, date })`). Shows 4, then `and 3 more →` (go('pot')). Eyebrow `Unlogged days` + `.nav-badge`-style count. Empty: the widget is **not rendered**, the Bills ledger spans 12 and the ribbon shows `✓ Every day accounted for`. This action never disappears while a day is unlogged (complaint 1).
- **Animation:** items slide in from the left (translateX −8px→0, opacity) 300ms stagger 40ms from 650ms; confirming collapses the item (opacity→0, translateX 12px, 200ms) before re-render; the badge re-counts.

### 6.10 Spending rhythm (this cycle)
- **Shows:** daily spend per cycle day vs the per-day line; future days as empty slots; legend `■ under per-day · ■ over per-day · – – per-day`; table toggle.
- **Visual:** Recharts `BarChart`: `<Bar dataKey="spent" maxBarSize={22} radius={[2,2,0,0]} isAnimationActive={!reduced} animationDuration={700} animationBegin={700}>` with `<Cell fill={d.future ? 'var(--surface-2)' : d.spent <= d.allowance ? 'var(--series-1)' : 'var(--series-2)'} stroke={d.future ? 'var(--border)' : undefined} />` and `<LabelList dataKey="over" content={▲ glyph in --series-2 above over-budget bars} />`; `<ReferenceLine y={allowance} stroke="var(--ink)" strokeDasharray="4 4" strokeWidth={2} label="per-day" />`; `XAxis` mono day numbers, `YAxis` `compact`, `CartesianGrid` horizontal only in `--grid`; `Tip` unchanged (text tokens, swatch for identity). `.chart-box` height 220px here.
- **Animation:** Recharts bars grow from the baseline + `.curtain` 800ms so days appear in order.

### 6.11 Savings goals
- **Shows:** active goals (max 4, then `all goals →`): name (`dir=auto`), `saved / target` mono 13px right-aligned, 6px meter (`.bar`, reached = `.bar.ok` + `✓`), `save about X per month`, percent 12px `--text-2`; total saved as 28px `.stat-value`.
- **Animation:** rows rise 360ms stagger 40ms from 750ms; meters `scaleX` 0→1 600ms after landing; total counts up.

### 6.12 Investments
- **Shows:** three mini stats (eyebrow + 20px): net invested, current value, gain/loss with ▲/▼, sign, percent, `--pos/--neg`; top 4 holdings by value as paired 6px bars (invested `--series-1`, value `--series-3`, 2px gap, direct-labelled amounts mono 12px) with basis notes (`estimated`, `as of 12 Oct`).
- **Animation:** values count up 800ms from 800ms; bars `scaleX` 0→1 600ms stagger 60ms per holding.

### 6.13 Where it went (categories, this cycle)
- **Shows:** `spendingByCategory` top 6 (rest folded into `Other`), daily vs non-daily split, link `Reports →`; table toggle.
- **Visual:** Recharts `BarChart layout="vertical"`: stacked `<Bar dataKey="daily" stackId="a" fill="var(--series-1)" />` + `<Bar dataKey="nonDaily" stackId="a" fill="var(--series-2)" stroke="var(--surface)" strokeWidth={2} />` (stroke gives the 2px gap), category `.dot` (schema colour, 1px `--ink` ring) before each `YAxis` label via a custom tick, totals direct-labelled at bar end in mono 12px.
- **Animation:** bars grow from the left (700ms, begin 900ms); labels fade in at the end.

### 6.14 Nudge footer
- `.banner` strip(s) for: new cycle started (keep/change per-day with the existing `Keep 70.00` / `Change` buttons), last export ≥ 30 days / never (`Export now`). Fades in last (opacity 240ms at 1.05s).

---

## 7. Motion

### 7.1 Tokens and easings
`--dur-1` 120ms hover/press · `--dur-2` 220ms chips, toggles, nav indicator · `--dur-3` 360ms row/list entrance · `--dur-4` 900ms count-ups and chart draws · page transition 260ms.
`--ease-out` `cubic-bezier(0.22, 1, 0.36, 1)` for every entrance and count-up (JS twin: `easeOutExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)`) · `--ease-in-out` `cubic-bezier(0.65, 0, 0.35, 1)` for the nav indicator and curtains · `--ease-pop` `cubic-bezier(0.34, 1.56, 0.64, 1)` only for chips/badges appearing (260ms).

### 7.2 Entrance choreography
```css
@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes fade-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes stamp { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: none; } }
@keyframes curtain { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 var(--accent-glow); } 70%, 100% { box-shadow: 0 0 0 8px transparent; } }
.widget-body { animation: rise var(--dur-3) var(--ease-out) both; animation-delay: calc(150ms + var(--i) * 45ms); }
.widget-body > .row-anim { animation: rise var(--dur-3) var(--ease-out) both; animation-delay: calc(var(--t0) + var(--j) * 40ms); }
.strip-cell { animation: stamp 260ms var(--ease-out) both; animation-delay: calc(350ms + var(--d) * 18ms); }
.live-dot { animation: pulse 2s ease-out infinite; }
```
Figures start their count-up at `150ms + widget delay`; charts set `animationBegin` to the same; the page settles by ≈ 1.2s.

### 7.3 Count-up (`useCountUp`)
```ts
useCountUp(target: number, opts: { duration?: number /*900*/; delay?: number; id: string }): { text: string; settled: boolean }
```
- rAF loop: `value = from + (target − from) * easeOutExpo(t)`; renders `formatAmount(Math.round(value))` each frame (integer minor units, never fractional); snaps **exactly** to `target` at the end; cancels on unmount.
- `from`: **0 on dashboard mount** (the owner wants figures to fill up on every entry), and for later target changes within the same mount (quick add, pay/skip) the **previous rendered value** for that `id`, kept in a per-mount `useRef(Map)`.
- Pauses/bails when `document.hidden`, when the Modal is open (`[aria-modal]` present), and under reduced motion (returns `target` immediately, `settled: true`).
- Markup: `<span class="count num" data-settled={settled} aria-hidden={!settled}>{text}</span>` plus, **only while counting**, a `.sr-only` sibling holding the final formatted value. After settle the DOM is exactly the final value (so `.stat-value` text is `210.00 SAR`). Width locked to the wider of the start and final strings while counting (§3). Whole numbers (entries, days to payday) use the same atom with `integer`; no page calls the hook itself.
- Behind an open dialog the loop requests no frames (an event-driven gate wakes it once), and on resume it eases from the shown value without re-applying `delay`.

### 7.4 Charts (Recharts 3)
- `const reduced = usePrefersReducedMotion()` (`matchMedia('(prefers-reduced-motion: reduce)')`, subscribes to change). Never hard-code `isAnimationActive`.
- Dashboard charts: `isAnimationActive={!reduced} animationEasing="ease-out"`, `animationDuration` 700 (bars) / 900 (lines, areas), `animationBegin` = widget delay. Chart roots are keyed by `visit`, **not** by data, so a quick add re-counts numbers without redrawing every chart.
- Left-to-right reveal: `.chart-box { position: relative; } .curtain { position: absolute; inset: 0; background: var(--surface); transform-origin: right; animation: curtain 800ms var(--ease-in-out) forwards; pointer-events: none; }` (`display: none` under reduced motion). `.chart-box` keeps a fixed height (260px default, 220 rhythm, 72 pot spark, 56 masthead spark) and `min-height` so `ResponsiveContainer`'s zero-size first frame never shows.
- Reports: animate **once on page mount** only (`const [animate, setAnimate] = useState(!reduced)`; set false on cycle change) so a reading page with a picker doesn't replay.

### 7.5 Hover, press, transitions
- `.btn:hover` background 120ms; `.btn:active` `scale(0.98)` 90ms; `.primary:hover` glow 160ms; cards: border → `--text-3` 160ms, no lift; table rows hover `--surface-2`; nav indicator `translateY` 220ms `--ease-in-out`.
- Page: `.page` `fade-rise` 260ms on mount, nothing on exit. Modal: overlay opacity 180ms, dialog `scale(0.98→1)` + opacity 220ms `--ease-out`. Toasts: `translateX(16px→0)` + opacity 220ms. Lock screen wrong PIN: `translateX` shake ±4px 300ms.

### 7.6 Reduced motion
Keep the existing global rule `@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }`. Additionally: `useCountUp` resolves instantly; Recharts `isAnimationActive={false}`; `.curtain { display: none }`; live dot static; no shake; no ink drop. A future `Animations: Match Windows / On / Off` setting needs a schema bump (OPEN-QUESTIONS), so v1 follows the OS.

### 7.7 Performance rules
Animate only `transform`, `opacity`, `stroke-dashoffset` and `box-shadow` on small elements. Sanctioned paint-only exceptions, all one-shot (never looping) and confined to a single cell or table row: the 120ms hover `background` transitions in §7.5, `flash-pos` (the Mark-paid row flash, 240ms), `today-pulse` (`outline-offset`, 400ms) and the Pot-history row highlight `hx-hit` (`background`, 1.6s). Never animate `background`, `outline`, `filter` or layout properties on `.page`, `.widget`, `.card` or anything larger than a row. One `backdrop-filter` element. No `filter: blur` on large layers. `contain: layout style` on `.widget` (no `paint`: inline popovers such as `.strip-pop` must overflow the widget; `Modal` is portalled to `<body>` so it is unaffected). `will-change` only on `.nav-indicator`. Grain is static. Count-ups bail when hidden and request no frames behind a dialog.

---

## 8. Per-page guidance

**Transactions** — a true ledger. Header actions: `Export CSV`, `Add transaction`. Filters sit in one hairline bar (`.rule` top, no card). Day groups use a mono eyebrow dateline on a 1px rule (`TUE 14 OCT · spent 52.00`); rows 36px with the category `.dot` (1px ink ring), name 14px, kind · note 12px `--text-2`, amount right in tabular with U+2212 for spend and `+`/`--pos` for income; edit/delete ghost icons appear on hover / `:focus-within`. New rows rise 220ms; delete collapses the row (200ms) then the undo toast. The date input in the add/edit dialog accepts any date from the first tracked day to today (complaint 3), with a hint `Need an earlier date? Extend tracking back under Pot history`.

**Bills** — header shows `Active total` as a 40px `.hero-2` with the mono eyebrow `per month`; table with the 2px-rule head, due day in mono, months range, chips with glyphs; History modal reuses the same table and chips; the Pay dialog keeps its wording and shows the split preview as a two-segment cool/warm mini bar (pot `--series-1` / main `--series-2`); `Paid on` accepts any date from the first tracked day.

**Pot history** — the **Day Strip** runs full width above the table (same cell encoding; clicking a cell scrolls to and highlights its row; unlogged cells offer the confirm/add popover); the three stat tiles become eyebrow + 28px values on one hairline row; the table gets ▲/▼ glyphs on delta, bill payments as mono sub-lines, `Pot after` bold; unlogged rows carry the `--warn` left bar and an inline `✓ Spent nothing` button (second home of the complaint-1 fix). Header actions: the cycle picker and **`Extend tracking back`** (`.btn`), a dialog: new start date (validated by `validateExtendBack`), per-day for the added cycles (prefilled with the current), checkboxes `Mark the added days as spent nothing` (`confirmDays`, default on) and `Mark past bill months as skipped (paid before tracking)` (`skipPastBills`, default on, with the count of months it will settle), a `planExtendBack` preview listing the cycles that will be created (dates + days, with a note when a short cycle lands right before the original first cycle) and the sentence stating what the pot on the original first day will start at, then `cycle:extendBack`. The same dialog is reachable from Settings → Budget cycles. Editing a *past* cycle's per-day or boundaries is **tracked separately** (engine + IPC not yet present): show the action disabled with `title="Coming in a later version"` only once the IPC exists; until then do not render it.

**Savings goals** — cards become poster blocks (`.poster`): goal name in display 24px, saved amount 40px `.hero-2` counting up, 10px meter on `--accent-2` track, `save about X per month` in mono, actions as a `.btn.sm` row; reached goals get a `--pos` rule header with `✓`.

**Investments** — three 28px figures on one hairline row (gain with ▲/▼ and percent), holdings table with paired thin bars (invested `--series-1` / value `--series-3`) and basis notes in 12px; row actions collapse into a `⋯` ghost menu under 1100px.

**Reports** — `ChartCard` gets the rule header, legend with swatches, curtain reveal and one-time Recharts animation (§7.4), duotone fills: daily spend `--series-1`, pot at end `--series-3`, bills from main `--series-2` (chart order s1 · s3 · s2, validated); portfolio invested `--series-1` vs value `--series-3`; per-day reference line dashed 2px `--ink`; the cycle summary table uses ▲/▼ glyph deltas in `--pos/--neg` with the number, indented sub-rows in `--text-2`. Card headings `Daily spending vs per-day`, `Pot balance over time`, `Cycle over cycle`, `Spending by category`, `Portfolio` keep their exact text (showcase test).

**Settings** — one long editorial form: each section is an eyebrow on a 2px rule (`.section-head`) with a two-column body (label column 240px, 12px; controls right). Theme control becomes three labelled swatches (`Match Windows / Light / Dark`, `role="radiogroup"`) with a 2px `--focus` ring on the selected one and the word underneath. New **Balance** section: `My balance right now is …` (sets `balanceAnchor` via `anchorForBalanceNow`) + `Clear anchor`, explaining the drift rule from 05 §10. Backups table in mono; About as a colophon in 12px.

**Setup wizard** — full-bleed masthead `DailyPot` 48px display, steps as four ink segments (`.steps`, current filled accent), one paper card per step; the preview banner becomes a Day Strip preview of the first cycle (back-filled days dotted warn) with the cycle budget and bills due in display 20px. New optional step field on Basics: `Main balance today (optional)` → anchor. All existing labels, placeholders and button names stay exactly (`Payday`, `Start tracking from`, `past day(s) with no entries`, `Per-day (SAR)`, `Name`, `Amount`, `Due day`, `Add bill`, `Next`, `Start using DailyPot`, heading `Welcome to DailyPot`).

**Lock screen** — paper page with `DailyPot is locked` in display 28px; PIN entry rendered as 8 `.pin-box` ink squares that fill per digit (the real `<input aria-label="PIN">` stays visually hidden but focused, so `getByLabel('PIN')` works); error in `--neg` with `!` glyph (`Wrong PIN`), retry countdown in mono (`Try again in 3s`), shake on wrong PIN; `Unlock` as a full-width primary.

**Recovery / load error / read-only** — the existing `.center-screen .panel .card` layout with the rule header and display headline; no other change.

---

## 9. Accessibility and performance

### 9.1 Focus
```css
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; box-shadow: 0 0 0 2px var(--focus-halo); }
.input:focus-visible { outline-offset: -1px; box-shadow: none; }
.recharts-surface:focus-visible { outline-offset: -2px; box-shadow: none; } /* charts are keyboard stops (Recharts accessibilityLayer: Left/Right walk the tooltip); ring inset because .chart-box clips overflow */
details > summary { min-height: 24px; line-height: 24px; cursor: pointer; } /* native disclosures reach the 24px target and keep their ▶ marker (display: flex would drop it) */
```
The halo is mandatory: it is what makes the ring visible on accent-filled buttons (ring vs halo 6.05 light / 8.88 dark). The nav indicator is never the focus ring. A state rule may never set `outline` or `box-shadow` in a way that out-specifies `:focus-visible` (strip cells use `border` for their dotted state and declare their own `:focus-visible` after every state rule). All hit targets ≥ 24px (strip cells 24px), buttons 34px (`.sm` 28px, only inside rows with ≥ 8px spacing).

### 9.2 Text, not colour
- Chips: glyph + word. Deltas: ▲/▼ + sign. Negatives: U+2212 + colour. Meters: `x / y` text. Strip cells: fill/hollow/dotted/outline/dot + `aria-label` + title + legend + the Pot history table. Over-budget bars: ▲ `LabelList` + the dashed per-day line + tooltip text. Every ≥ 2-series chart has a legend with swatches and a **table toggle**; single-series charts need no legend (the title names the series).
- Text always wears text tokens; a colour swatch beside it carries identity. Status colours are never used as series colours and vice versa.
- Counting numerals are `aria-hidden` while counting with an `.sr-only` final value; toasts keep `role="status" aria-live="polite"`; the quick-add receipt's live region stays mounted (only its content changes); the Modal keeps its focus trap (Tab/Shift+Tab wrap, `#root` made `inert` while any dialog is open), `aria-modal`, initial focus and Escape, and never moves focus on a re-render behind it.
- Both themes meet the §2.3 table; the lowest text pair is 4.75:1, the lowest control boundary 3.30:1.

### 9.3 Motion and transparency
`prefers-reduced-motion` (§7.6) and `prefers-reduced-transparency` (§4.5) are both honoured. Count-ups never run behind an open dialog or in a hidden window.

### 9.4 Zoom and DPI
Text zoom to 200%: the hero clamps by digit count, the bento falls to compact spans, tables scroll inside `.table-wrap`. At 125/150% Windows scaling, 1px hairlines render at 1.25–1.5px (acceptable, decorative); verify the 2px rules stay crisp (`border-width: 2px`, no fractional transforms on rule elements).

### 9.5 DOM and performance
No virtualisation is needed (≤ 31 strip cells, ≤ 10 bill rows, 30-point sparklines). Keep the DOM light: no wrapper per animated hairline, one `.curtain` per chart, one SVG per ring/strip. Memoise engine results per state version in `Derived`. Dashboard target stays < 50ms compute with 5 years of data (DEVELOPMENT-FRAMEWORK §10).

### 9.6 Tests
Class names and texts the e2e tests rely on are preserved (§5, §6.4, §6.5, §8). One required test change: the smoke test's one-shot `expect(await potValue(page)).toBe('210.00 SAR')` must become an auto-retrying `await expect(card.locator('.stat-value')).toHaveText('210.00 SAR')` (Playwright normalises whitespace), because the value counts up for ≈ 1s after the heading appears. `[data-settled="true"]` on `.count` is available for tests that need to wait for the choreography.

---

## 10. Implementation notes and risks

1. **Engine first.** `computeBalance`, `balanceSeries`, `anchorForBalanceNow`, `netWorth`, `unloggedDays`, `planExtendBack`/`extendCyclesBack`/`validateExtendBack` and `cycle:extendBack` already exist (schemaVersion 2, ADR-0007). Add `balance` and `netWorth` to `Derived`. Nothing in this document requires a new schema field; the optional "Animations" setting would.
2. **Hooks to add** (`src/renderer/src/hooks/`): `usePrefersReducedMotion`, `useCountUp`, `useVisit` (dashboard remount key). No new dependencies.
3. Windows 10 falls back to static Segoe UI (weight 650 → 600, slightly different tracking); check the hero at 72px on both.
4. Replaying the entrance on every dashboard visit: keep the full choreography ≈ 1.2s, start from 0 on entry, and be ready to add the Animations setting if it annoys.
5. Recharts `ResponsiveContainer` renders at 0 size for one frame: fixed `.chart-box` heights + `min-height`, curtain on top.
6. Hairline bento flashing: animate only `.widget-body`, keep borders on `.widget`/`.card`.
7. `backdrop-filter` on the sticky header costs on weak GPUs in dark mode: single element, downgrade to opaque `--surface` if frames drop.
8. Warm paper slightly tints user-chosen category colours: keep the 1px ink ring on `.dot`, never use category colours for bars.
9. Long Arabic/English names with `dir="auto"` in tight rows: no negative tracking on user text, `min-width: 0` on flex children.
10. Palette adjacency rules in §2.4 are mandatory: never place `--series-1` next to `--series-5`, or `--series-2` next to `--series-4`/`--series-6`; status colours never appear in charts.
11. `useCountUp` must round to integer minor units, snap exactly, and never run while a Modal is open or the document is hidden.
