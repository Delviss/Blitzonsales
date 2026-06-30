# BlitzON Control — Workflow Reference

## Flow A: Monatlicher Provisionslauf

1. **Teamleiter** exports the contract list from Joules tab "Verträge / Anträge" as CSV or Excel.
2. **Teamleiter** uploads the file to BlitzON Control via the import screen.
3. **System** normalises the data: maps column headers, converts Excel date serials to ISO dates, deduplicates via `joules_id`.
4. **System** evaluates each contract against `commission_rule` entries (validity, exclusion, product, cutoff, rate, clawback) and writes the result plus a human-readable `begruendung` to a draft `commission_run`.
5. **Teamleiter** reviews the draft: sees which contracts are valid, which are excluded and why, and which trigger clawback lines.
6. **Backoffice** resolves any rows flagged as `Datencheck` (missing `lieferbeginn`, unknown product) in Joules, then marks them cleared in BlitzON.
7. **Admin / GF** approves the run (four-eyes principle). The run status changes from `entwurf` to `freigegeben`, the list is frozen, and an `audit_log` entry is created.
8. **Admin / GF** exports the approved run: internal Excel summary, per-rep PDF Abrechnung, DATEV/CSV for accounting.

## Flow B: Verkäufer prüft Verdienst

1. Rep logs in and sees their personal dashboard: earnings this month, contracts by status.
2. Rep opens a Widerruf entry and reads the reason for the −50 € deduction (date, rule name, original status).
3. Rep downloads their PDF Abrechnung.

## Flow C: Admin ändert Satz

1. Admin opens the rule for the relevant product/org combination, e.g. "Satz swa Gas Fest6 Neukunde".
2. Admin sets a new `gueltig_ab` date and saves the new `satz`. Previously approved runs are unaffected because they reference the rule snapshot at their approval time.
3. The `audit_log` records the old and new `satz` value with the editor's user ID and timestamp.

## Flow D: Datacheck-Klärung

1. System flags a contract row as unclear, e.g. `lieferbeginn` is empty or the product name does not match any known `produkt`.
2. Backoffice looks up the contract in Joules, then either fills in the missing data or marks the row as rejected.
3. The resolved row re-enters the commission run; the Datencheck flag is cleared.
