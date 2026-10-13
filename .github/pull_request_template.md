<!-- Keep PRs small and reversible. Link the phase/issue. -->

## What & why
Closes #

## Phase / acceptance criteria
<!-- Which roadmap phase (docs/08)? Which acceptance criteria does this satisfy? -->

---
## Security checklist (docs/frameworks/SECURITY-FRAMEWORK.md)
- [ ] New IPC command/collection: zod validation + referential rules + lock check in main, with positive/negative tests
- [ ] Preload exposes only named functions; no Node/Electron objects in the renderer
- [ ] Hardened webPreferences, CSP, navigation/window/permission blocks and network block unchanged (or ADR linked)
- [ ] No secrets; lockfile committed; `npm audit` green; new deps reviewed (license MIT-compatible)
- [ ] File inputs size-capped, validated, path-safe; CSV formula-injection safe
- [ ] Destructive actions write a backup first; no amounts/notes/PINs in logs

## Development checklist (docs/frameworks/DEVELOPMENT-FRAMEWORK.md)
- [ ] Types from zod schemas; strict TS; lint clean
- [ ] Money rules only in `src/shared/engine` (integer minor units, `dates.ts`); matches docs/05
- [ ] Data-shape change = schemaVersion bump + migration + test
- [ ] Empty/loading/error states; keyboard + labels; light & dark checked
- [ ] Tests added/updated; CI green

## Notes / decisions
<!-- Non-obvious architectural choice? Add/link an ADR in docs/decisions/. -->
