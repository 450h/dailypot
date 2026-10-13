# Contributing to DailyPot

Thanks for helping! DailyPot is small and deliberately simple. These notes keep it that way.

## Ground rules
- **Offline forever.** No network calls, telemetry or auto-update ([ADR-0005](docs/decisions/0005-no-network-no-auto-update.md)). A change that needs the network needs a new ADR first.
- **Money is integers.** All amounts are integer halalas/cents ([ADR-0003](docs/decisions/0003-money-as-integer-minor-units.md)). Dates are `YYYY-MM-DD` strings via `src/shared/dates.ts`.
- **The money rules live in one place:** `src/shared/engine/`, specified in [docs/05-data-model.md](docs/05-data-model.md). If you change a rule, update the doc and add a test.
- **The UI is untrusted.** Validation and rules run in the main process (`src/main/commands.ts`). The preload exposes named functions only.

Read [CLAUDE.md](CLAUDE.md) and the two frameworks in [docs/frameworks/](docs/frameworks/) before larger changes.

## Workflow
1. `npm install`, then `npm run dev`. Dev data goes to `.dev-data/`.
2. Make your change, with tests:
   - Engine/rules → `src/shared/engine/*.test.ts`
   - Validation/store → `src/main/*.test.ts`
   - User flows → `tests/e2e/`
3. Before opening a PR, run:
   ```bash
   npm run typecheck && npm run lint && npm test && npm run test:e2e
   ```
4. Open a PR using the template checklist. CI runs the same checks on Windows.

## Bug reports
Use the bug template. **Don't attach your real `data.json`.** For pot math issues, describe the per-day, the payday and each day's spending with made-up amounts.
