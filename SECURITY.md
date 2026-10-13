# Security Policy

DailyPot is an offline app that stores data only on your PC. If you find a vulnerability (for example, a way for an imported file or note text to execute code, or a way around the PIN screen), please **report it privately** through GitHub's **Security → Report a vulnerability** on this repository. Don't open a public issue.

Please include the version, the steps to reproduce and the impact. Fixes ship as a new release, with the impact described in the release notes.

Known limitation (by design in v1): the PIN locks the app's screen but does **not** encrypt `%APPDATA%\DailyPot\data.json`.
