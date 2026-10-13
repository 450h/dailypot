# Glossary (DailyPot)

Domain and technical terms. These are not legal definitions.

## Domain / product
| Term | Meaning |
|---|---|
| **Per-day (daily allowance)** | The amount you allow yourself to spend each day in a cycle. |
| **Daily expense** | Everyday spending that counts against the per-day. |
| **Non-daily expense** | A one-off or big expense (repair, gift, travel) paid from the main balance. It doesn't touch the per-day or the pot. |
| **Cycle** | A budget month from payday to the day before the next payday. |
| **Payday** | Day of the month your salary arrives (1–31; clamped to the month's last day). |
| **Side pot (pot)** | The running total of unspent per-day money minus overspending and the bills it has paid. It may go negative ("pot deficit"). |
| **Delta** | Per-day minus daily spending for one closed day. It is added to the pot. |
| **Obligation (bill)** | A recurring monthly payment (phone, gym, subscription) with a due day. |
| **Instance** | One month's occurrence of an obligation. |
| **Earmark / funded** | How much of the current pot is notionally set aside for each unpaid bill, nearest due first. |
| **Shortfall (from main balance)** | The part of a bill payment the pot couldn't cover. |
| **Rollover** | A cycle's closing pot becoming the next cycle's opening pot. |
| **Safe-to-spend** | The per-day spend that still lets the pot cover this cycle's remaining bills. |
| **Main balance** | Your actual bank/cash money outside the pot. DailyPot doesn't track its balance; it shows cash flow. |
| **Net invested** | Total bought minus total sold for a holding. |
| **Valuation** | A manually entered current value of a holding on a date. |
| **Halala** | 1/100 of a Saudi riyal; the minor unit used for storage. |

## Technical
| Term | Meaning |
|---|---|
| **Main process / renderer / preload** | Electron's privileged Node process, the sandboxed UI process, and the bridge script between them. |
| **IPC** | Inter-process messages between the renderer and main; the app's only trust boundary. |
| **contextIsolation / sandbox** | Electron settings that keep web content away from Node/Electron APIs. |
| **CSP** | Content Security Policy: browser rules limiting which scripts/styles/connections are allowed. |
| **Atomic write** | Write to a temp file, flush, then rename, so the real file is never half-written. |
| **Minor units** | Integer storage of money in the smallest unit (halalas). |
| **Fuses** | Electron build-time switches that disable risky runtime features. |
| **ADR** | Architecture Decision Record. |
