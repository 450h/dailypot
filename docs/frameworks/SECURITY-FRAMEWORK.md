# Security Framework — Engineering Rules (DailyPot)

> These are **binding rules**, not background reading. A PR that violates a 🔴 MUST does not merge. They're adapted to a **local-only Electron app** and grounded in the [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security) (accessed 2026-10-13, High) and OWASP ASVS principles.
> In this app, "server" means the **Electron main process** and "client" means the **renderer**. Section numbers match the template; gaps are intentional.

Legend: 🔴 MUST (block merge) · 🟡 SHOULD (justify if not) · 🟢 GUIDANCE.

## 0. First principles
1. **The renderer is hostile.** Security lives in the main process, never in React.
2. **One authoritative check:** every IPC command is validated (sender, lock state, zod schema, references) in main. Checks in the renderer are UX only.
3. **Three root causes to design against:** trusting the renderer, exposing Node/Electron to web content, and not validating input (IPC payloads, imported files) in main.
4. **Nothing leaves the device** (ADR-0005). Privacy here means no network, plus the user controls their own files.

## 1. Authorization at the data layer (core control)
> There's one local user, so there are no row policies. The control is **the IPC allowlist plus main-process validation** (docs/05 "Authorization model").
- 🔴 **Deny by default:** the preload exposes only named functions. There's no generic `invoke(channel)`, and no `ipcRenderer` reaches the renderer.
- 🔴 Every new collection or command ships with its zod schema and its referential rules **in the same change**.
- 🔴 **Server-write-only fields:** `createdAt`, `lastExportAt`, cycles (dates and allowance, only via `cycle:*` commands), `settings.setupComplete` and `schemaVersion` are set by main. The renderer generates UUID v4 ids, and main validates their format and uses them for idempotent create-or-update.
- 🔴 While locked, every data command is refused (tested).
- 🔴 IPC tests cover a valid payload (accepted) and invalid ones (wrong type, unknown collection, a dangling reference, a future date, locked state), all rejected.

## 2. Secrets, trust boundary & supply chain
- 🔴 The app has **no API keys or secrets**. The only secret-like material is the PIN hash, which lives in `security.json`, is read only by main and is never sent over IPC.
- 🔴 `.env*` gitignored. CI signing secrets (if D2 is ever chosen) go in GitHub Actions secrets only.
- 🔴 **Supply chain:** lockfile committed; `npm ci` in CI; exact version pins; Dependabot on; `npm audit --audit-level=high` fails CI; new dependencies get reviewed (maintenance, popularity, license, install scripts) and come only from the npm registry. Keep the dependency count minimal.

## 3. Authentication, identity & operator accounts
- 🔴 The PIN is hashed with **scrypt** (Node `crypto`, random 16-byte salt) and compared with `timingSafeEqual`. Never stored or logged in plaintext.
- 🔴 Wrong-PIN backoff and lock state are enforced in main, not the renderer.
- 🔴 **MFA on the maintainer's GitHub account** (it controls source and releases). Recovery codes stored offline.
- 🟡 Recommend 6+ digit PINs in the UI.

## 4. Input validation & integrity
- 🔴 **Validate every IPC payload and every file read from disk** (data.json, imports, backups) with the shared zod schemas in main, using **strict objects (unknown keys rejected)**. "Date ≤ today" checks apply **only to IPC writes**, never to files being loaded (05 §9), so a backwards clock can't trigger the corruption fallback.
- 🔴 Money math uses integer minor units only (ADR-0003). Derived figures come from the pure engine (ADR-0004).
- 🔴 Upserts are idempotent by `id`. Re-sending the same command has one effect.
- 🔴 File inputs: 50 MB size cap; backup names must match the allowlisted pattern and resolve inside the backups folder (no path traversal).
- 🔴 CSV export neutralises formula injection: prefix **text** cells starting with `= + - @`, tab or CR with `'`. Amounts stay numeric. Write UTF-8 with a BOM.

## 8. Logging, audit & incident response
- 🔴 Destructive local actions (import, restore, delete of a goal/holding with history) write a backup first. That backup is the audit trail for a single-user app.
- 🔴 Never log amounts, notes, names or PINs. The local log holds error types and stack traces only.
- 🔴 **Incident = a vulnerability report or a data-loss bug.** Triage via GitHub Security Advisories (enable private vulnerability reporting). Fix, release, and describe the impact in the release notes. The README links `SECURITY.md`.
- 🔴 **Tested backups:** the store tests restore a snapshot and verify it. The corruption fallback is tested.

## 9. Rate limiting & abuse
- 🔴 PIN attempts: exponential backoff (1s → 30s cap) in main.
- 🟢 There are no other abuse surfaces (no network, no multi-user).

## 11. Electron desktop hardening (project-specific)
- 🔴 `BrowserWindow` webPreferences: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`. No `allowRunningInsecureContent`, `experimentalFeatures`, `enableBlinkFeatures` or `<webview>`.
- 🔴 **Single instance:** `app.requestSingleInstanceLock()`. A second launch quits and focuses the existing window, which prevents two writers on the same `data.json`.
- 🔴 DevTools are disabled in packaged builds (`devTools: !app.isPackaged`).
- 🔴 CSP is sent as a response header by the `app://` handler (and also as a meta tag for dev). `frame-ancestors` only works as a header: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. Inline *styles* are allowed only because chart libraries set style attributes. Inline *scripts* are never allowed.
- 🔴 Block navigation (`will-navigate` → `preventDefault` unless it's the app's own URL). `setWindowOpenHandler` → `deny`.
- 🔴 `session.setPermissionRequestHandler` → deny everything.
- 🔴 Production builds cancel all `http`, `https`, `ws` and `wss` requests (ADR-0005). The dev server URL is allowed only when unpackaged.
- 🔴 Validate the IPC sender: `event.senderFrame` must be non-null and its URL must be the app's own origin (`app://` in prod, the dev server URL in dev).
- 🔴 `shell.openExternal` is called only with hardcoded constants.
- 🔴 Production builds load the UI from a custom `app://` protocol. Call `protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true } }])` before `ready`, then serve with `protocol.handle`, using path normalisation that refuses anything outside the renderer folder. No `file://`.
- 🔴 Electron fuses at package time: `RunAsNode=false`, `EnableNodeOptionsEnvironmentVariable=false`, `EnableNodeCliInspectArguments=false`, `OnlyLoadAppFromAsar=true`, `EnableEmbeddedAsarIntegrityValidation=true`, `GrantFileProtocolExtraPrivileges=false`, `EnableCookieEncryption=true`. Verify each against the electron-builder/@electron/fuses docs at P5.
- 🔴 Stay on a supported Electron major (checkpoint C3).
- 🔴 Test hook `DAILYPOT_DATA_DIR` (a shell environment variable) is honoured **only when `!app.isPackaged`**.

---
## Pre-merge security checklist
- [ ] Every new IPC command/collection has zod validation, referential rules and lock checks in main, **in the same change**, with positive and negative tests.
- [ ] The preload exposes only named functions; no Node/Electron objects reach the renderer.
- [ ] No secrets in the repo; lockfile committed; `npm audit` green; new deps reviewed (license MIT-compatible).
- [ ] File inputs size-capped, validated and path-safe; CSV formula-injection safe.
- [ ] Hardened webPreferences, CSP, navigation/window/permission blocks and network block are unchanged (or changed via ADR).
- [ ] Destructive actions write a backup first; no amounts/notes/PINs in logs.

## Sources
[Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security) (accessed 2026-10-13) · OWASP ASVS · electron-builder docs (fuses, NSIS) · Node.js `crypto.scrypt` docs. Re-verify key names and options when upgrading Electron or electron-builder.
