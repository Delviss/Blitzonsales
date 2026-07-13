# BlitzON Control: Implementation Progress

## Phases

- [x] **Phase 0**: Repo scaffold, domain types, workflow docs, docker-compose
- [x] **Phase 1**: NestJS API (auth, master data CRUD, audit), React web app
- [x] **Phase 2**: Commission rule engine, Provisionslauf, DATEV export
- [x] **Phase 3**: Excel import pipeline (Joules export normalization)
- [x] **Phase 4**: Dashboards, role-scoped reporting, exports (accounting/Excel/PDF)
- [x] **Phase 5**: Hardening, tests, DSGVO, CI gates, go-live documentation

Phase 2: `apps/api/src/commissions/`: `commission-engine.ts` (pure rule-matching/clawback
logic, unit tested), `CommissionRulesService`/Controller (`/api/provisionsregeln`, CRUD,
Admin/GF only), `CommissionRunsService`/Controller (`/api/provisionslaeufe`): create a
draft run for a `periode` (`JJJJ-MM`) + optional `organisationId`, `POST :id/generate` to
(re)compute draft lines (idempotent while `entwurf`), `POST :id/freigeben` to approve
(Admin/GF only, freezes the run), export endpoints (see Phase 4). Web pages:
Provisionsregeln (verwaltung), Provisionsläufe (list + detail with generate/freigeben/export
actions).

Phase 3: `apps/api/src/import/`: `import-normalizer.ts` (pure header-alias matching, Excel
serial/German-date parsing, unit tested), `ImportService`/Controller (`POST /api/import`,
multipart upload, Teamleiter/Backoffice/Admin-GF). Reads both real `.xlsx` workbooks and
CSV/plain-text exports (CSV is decoded as UTF-8 before parsing so umlauts in headers/values
survive; verified against a mojibake bug found during smoke testing). Web page: `/import`.

Phase 4: `apps/api/src/dashboard/`: `dashboard-aggregator.ts` (pure KPI/status/org/product/
energy-split/cancellation-rate/payout aggregation, unit tested including an explicit
reconciliation test against frozen-run totals), `DashboardService`/Controller (`/api/dashboard`)
reusing the same RBAC scoping rules as `ContractsService` (factored into
`common/rbac-scope.ts`) so a rep only ever sees their own data and a Teamleiter only their
own organisation. `apps/api/src/commissions/export/`: `AccountingExporter` interface with a
`CsvAccountingExporter` (default) and a `DatevAccountingExporter` (placeholder, see open
question below), selected via `GET :id/export/buchhaltung?format=csv|datev`; `exportIntern`
now includes a per-organisation summary sheet in addition to per-rep; a new
`GET :id/export/abrechnung/:repId` renders a per-rep PDF Abrechnungsblatt (`pdfkit`). All
three export paths write an audit_log entry (previously only DATEV/Excel export existed and
neither was audited). Web: `DashboardPage.tsx` gained `recharts` visualizations (status
distribution, energy split, org/product/rep performance, cancellation rate over time) and a
personal "Meine Provisionszeilen" view for Aussendienst; `ProvisionslaufDetailPage.tsx`
gained the CSV/DATEV export split and per-rep PDF download buttons.

Phase 5: Security hardening: mandatory TOTP 2FA for `admin_gf`/`backoffice` via a two-step
login (`/auth/login` returns `setup_required`/`verify_required`/`ok`; `/auth/2fa/setup`,
`/auth/2fa/activate`, `/auth/2fa/verify-login` complete the challenge; `JwtAuthGuard` rejects
any token carrying a `purpose` claim so a pending token can never reach a business endpoint).
Four-eyes approval: `commission_run.created_by` is now tracked and `freigeben` rejects the
run's own creator with 409. RBAC lockdown: `/api/verkaeufer`, `/api/provisionsregeln` and
`/api/provisionslaeufe` GET endpoints (previously open to any authenticated user, leaking
IBANs/rates/other reps' runs to Aussendienst) are now role-restricted; `ContractsService`
enforces the same scoping used by the dashboard. Rate limiting: `@nestjs/throttler` globally
(100 req/min) plus a stricter 5/min on `/auth/login` and 10/min on 2FA verification.
DSGVO: `apps/api/src/datenschutz/` exposes an Art. 15 export endpoint and an Art. 17 erasure
endpoint that pseudonymizes the login + linked sales rep while leaving contract/commission_line
rows untouched (accounting retention); documented in `docs/datenschutz.md`. Testing: unit
coverage added for RBAC scoping, 2FA-gated login, `JwtAuthGuard`, four-eyes approval, the
DSGVO service, the dashboard aggregator (with reconciliation test) and the accounting exporter
registry; a new HTTP-level e2e suite (`apps/api/test/app.e2e-spec.ts`, `npm run test:e2e`)
drives a full monthly commission cycle, 2FA enforcement, RBAC confinement, import validation
and dashboard reconciliation against a real Postgres instance. CI (`.github/workflows/ci.yml`):
added a `lint` job (ESLint, newly wired up: `.eslintrc.js` existed since Phase 0 but nothing
ever ran it) and a `migrate-and-e2e` job that runs migrations against a fresh Postgres service
container and then the e2e suite, both are hard merge gates alongside the existing api/web
jobs. Also fixed `migration:run` (referenced a nonexistent `src/migrations/run.ts`; never
worked; added it) and added `npm run seed:load` (`apps/api/src/seed/seed-load.ts`, several
months of synthetic contract volume across all seeded reps) plus a k6 script
(`scripts/load-test.js`) for load testing; see `docs/runbook.md` section 5 for the findings
from running it (dashboard is fast at ~2,900 contracts; `generate()` has an N+1 query worth
batching before much larger volumes). Docs: `docs/datenschutz.md`, `docs/runbook.md`,
German-language `docs/admin-guide.md`.

UI redesign (post-Phase 5): the web app was restyled after the Efferd Dashboard 2 layout
(21st.dev, `larsen66/efferd-dashboard-2`) with the logic mapped onto BlitzON Control
features. `apps/web` now has a shadcn-style structure (`@/` alias, `src/components/ui/`
primitives, CSS-variable design tokens with a dark default and a light theme toggle).
`components/app-shell.tsx` is the new collapsible-sidebar shell (role-filtered navigation,
user menu, notifications) replacing the old top-bar `Layout`; `components/dashboard.tsx`
replaces `DashboardPage` with KPI cells (month-over-month trends computed from closed
months only), Vertragseingang/Storno-Trend hero charts, Letzte Verträge, a Storno-Check
health card, an activity feed fed by Provisionsläufe/contract data, and all previous
role-scoped analytics charts. Legacy pages inherit the theme via token-remapped Tailwind
color names and continue to work unchanged inside the new shell.

## Phase 1 (Fachkonzept v1.0) — Foundation & calculation core

The GitHub tracker carries the BlitzON Fachkonzept „Provisions-, Rücklagen- und
Steuerungs-Tool" v1.0 as 9 epics (P0…P8, #13–#21) / 37 issues (I-01…I-37). This
work started with **Epic P0 (Foundation, I-01…I-04)** — the prerequisite every
other epic depends on — plus the pure calculation functions from P3/P4 whose
rules and numbers are fully specified in the issues.

**I-01 versioned config (ch. 16):** `packages/shared/src/fachkonzept.ts` defines
every business value as a `ConfigKey` with a shipped default (`FACHKONZEPT_DEFAULTS`)
and a pure as-of resolver (`resolveConfig`). `config_version` table +
`config-store/BusinessConfigService` persist and resolve values as-of a
reference date so recomputing a closed month uses the version valid then;
`GET/POST /api/config` (Founder read / Admin write, audited) and `seedDefaults`
seed the initial valid-from version. Nothing in the engine is hardcoded.

**I-02 contract model (ch. 4.2 / Joules ClientSchema):** `contract` gains
`swa_order_number`, `client_type`, `start_delivery_type`, `tariff_energy_type`,
electricity/gas surcharge, `previous_volume`, pre-contract/contract end, term,
SWA total/paid commission, credit-check/storno dates, expected-vs-actual SWA
commission + deviation + plausibility status + manual override.

**I-03 status & financial ledger (ch. 4.2/5.2/12.2):** append-only
`contract_status_event` and `financial_event` tables + `LedgerService`; every
status/money change is a timestamped event referencing the SWA order number and
original month, never mutated or deleted.

**I-04 rep/org master data (ch. 3/4.1):** `sales_rep` gains role, base salary,
join/leave dates, direct trainer/team-lead assignment, negative-balance & storno
accounts; `organisation` gains type and partner compensation model.

**Calculation core** (`commissions/fachkonzept/fachkonzept-engine.ts`, pure &
unit-tested against the ch. 14 worked examples that the issues quote):
minimum-volume qualification (I-13), retroactive employee/partner tiers (I-15/17;
the 40th new customer recomputes the whole month to €90), existing-customer flat
€50/€25/€25 (I-20), trainer/team-lead overheads with team-lead replacing trainer
and electricity+gas as two claims (I-19), the commercial engine incl.
120,000 kWh × 4 ct = €4,800, caps, 50/50 SWA halves and 25/25 & 35/35 splits
(I-21), the 20% commercial reserve (I-24), clawback pass-through with the fixed
offset order (I-25) and salary-protection/storno invariants (I-18). See
`fachkonzept-engine.spec.ts` (22 tests, all green).

**Persisted Fachkonzept Provisionslauf (Phase 1 remainder, done):** the pure
calculation core is now wired into runs. `commissions/fachkonzept/fachkonzept-run.ts`
is a pure orchestrator (`computeFachkonzeptRun`, unit-tested in
`fachkonzept-run.spec.ts`) that composes the engine into a full month: it counts
qualified new private customers per rep to drive the retroactive tier (I-15, the
40th customer recomputes the whole month), emits per-contract lines for
new/existing/commercial contracts, routes overheads to the directly-assigned
trainer/team-lead (I-19), splits the commercial engine into a due immediate share
and a non-due 12-month retention with the reserve on the real SWA receipt
(I-21/I-24), and produces a per-rep salary-protection/storno summary (I-18).
`FachkonzeptRunService` (+ `FachkonzeptRunController` at
`/api/provisionslaeufe/fachkonzept`) resolves the versioned config as-of the
period end, loads the month's contracts + rep master data, persists the lines
(`commission_line.typ` carries the category) and the summary
(`commission_run.fachkonzept_zusammenfassung`, jsonb; `verfahren='fachkonzept'`
distinguishes it from the legacy rule-engine run — the two coexist on the same
tables and each refuses to touch the other's runs). Freigabe posts the rep
negativsaldo/storno-account balance deltas and writes the append-only
`financial_event` ledger (four-eyes enforced). Migration
`1721001600000-FachkonzeptRun.ts` adds the two columns; the seed now carries the
I-02/I-04 shape (client/energy/new-vs-existing, a partner org, a trainer link,
one commercial contract) so a run has real data; the e2e suite drives the full
create→generate→four-eyes→freigabe cycle against Postgres.

**Still to build (Phase 1 remainder):**
the Joules/SWA API client & sync (P2, I-08…I-12), the master-data admin UI (I-07),
the Founder dashboard & drill-downs (P6), CRM/lead-time follow-up (P7),
month-end close & the warning system (P8). The exact ch. 14.2 salary euro
figures and the full SWA new-customer tier table need the authoritative
Fachkonzept document (the tracker truncates the long issue bodies) — the salary
function is implemented to the certain invariants and the SWA tier keeps only its
documented anchors (0–99 €160 … 300+ €205) with placeholder intermediate steps,
all as versioned config so the real tables drop in without code changes.

## Wave 1 (Foundation completion) — I-05 / I-06 / I-33

Lowest-level prerequisites that later waves read from. All three shipped with
migrations, seed data, unit + e2e coverage.

**I-06 Status master data (#27, Fachkonzept ch. 5.1/4.1):** a dedicated
`status_master` table (`apps/api/src/status-master/`) replaces the old
`qualifying_statuses` *config* value as the single source of truth for which
contract statuses qualify. Columns: `code`, `bezeichnung`, `qualifiziert`
(released-as-qualifying yes/no), `kategorie`, `gueltig_ab` (valid-from),
`quelle`. `StatusMasterService.qualifyingCodes(asOf)` resolves the latest
release per code not after the reference date; the **safety rule** — any status
not explicitly released as qualifying (including statuses absent from the
master) never counts — is enforced there and unit-tested
(`status-master.service.spec.ts`). The Fachkonzept tier/compensation engine now
reads its qualifying set only from this master (`FachkonzeptRunService.compute`
fills `config.qualifyingStatuses` from `StatusMasterService`), so
`ConfigKey.QualifyingStatuses` was removed. Seeded from the known status set
(stand-in for Joules `OPTIONS /clients/statuses`; four qualifying: Liefertermin
steht fest / In Belieferung / Im Wechsel / Exportiert). Surface:
`GET /api/status-master` (+ `/qualifying`) for Founder/Backoffice/read-only,
`POST` (new version) + `POST /seed` for Founder/Admin, audited. Migration
`1721260800000-StatusMaster.ts`.

**I-05 Role/permission model (#26, ch. 2.1/4.1/17):** Phase 1 is a
Founder/Backoffice tool only. The role set (`Rolle` in `@blitzon/shared`) is now
split into **Phase-1 roles** — `admin_gf` (Founder/Admin), `backoffice`
(Backoffice/Accounting), `readonly` (new read-only viewer, GET surfaces only) —
and **reserved portal roles** that exist in the model but are exposed by no
Phase-1 UI/endpoint: `aussendienst` (employee portal), `partner` (new),
`teamleiter` (legacy internal lead, retired from Phase-1 surfaces). Helper
constants `PHASE1_READ_ROLLEN` / `PHASE1_OPERATIONS_ROLLEN` /
`RESERVIERTE_PORTAL_ROLLEN` drive the `@Roles` decorators. Every RolesGuard-
protected read surface now admits Founder/Backoffice/read-only; operational
surfaces (create/generate run, import, export) admit Founder/Backoffice only;
management (users/master data/rules, run Freigabe) stays Founder/Admin. The
portal roles' data-visibility scoping (contracts/dashboard self-service) is kept
as groundwork but reaches no gated endpoint in Phase 1. Web nav
(`app-shell.tsx`) mirrors this. Seed carries one user per role; e2e proves
read-only can read but not write, and that the retired teamleiter is blocked.
Auth rate limits (login 5/min, 2FA-verify 10/min) are unchanged in production
but relaxed under the test runner so the suite's sequential logins don't trip
the window.

**I-33 Contract-end storage & existing-customer lead time (#54, ch. 5.3/17):**
delivery start (`lieferbeginn`) and contract end (`vertrag_ende`) are persisted
for every contract; the import pipeline now maps a contract-end column
(`import-normalizer.ts` alias set + `import.service` upsert). A general
existing-customer pre-end lead time is exposed as the system parameter
`ConfigKey.ExistingCustomerLeadTimeMonths` — **prepared but with no fixed value
in Phase 1**: its default is `null`, `seedDefaults`/seed skip null-valued keys,
so the key is resolvable (returns `null`) without assuming any number. Distinct
from the pre-existing `lead_time_days` (I-31 Vorvertrag rule).

## Wave 2 (Calculation stack) — I-14 / I-18 / I-24 / I-25 / I-23 / I-07

Turns the engine output into persisted posting objects and completes the tier /
salary layers. All shipped with migrations, unit + service + e2e coverage.

**I-14 SWA new-customer tier + plausibility control (#35, ch. 6.1/5.2):** the
SWA new-customer tier (`ConfigKey.SwaNewCustomerTier`, anchors 0–99 €160 …
300+ €205) is now applied on the **billing month's whole qualified
new-customer volume, company-wide** — every qualified new private contract plus
every commercial contract (commercial always counts as new; existing customers
excluded) — via `swaTierLevel`/`swaExpectedCommission` (pure,
`fachkonzept-engine.ts`). `computeFachkonzeptRun` emits a per-contract
`plausibility` row (expected vs. actual SWA commission, deviation, status
`ok`/`abweichung`/`offen` against `ConfigKey.PlausibilityToleranceAbs`, default
€1) and a monthly `swaTier` roll-up (reached level, next threshold, totals,
counts). A commercial contract's *expected* SWA is its engine total (kWh ×
surcharge), not the flat tier rate, but it still increments the tier count.
`FachkonzeptRunService.generate` writes the comparison back onto each contract
(`erwartete_swa_provision`, `tatsaechliche_swa_provision`, `abweichung`,
`plausibilitaet_status`) — the actual SWA list stays the booking truth, only the
comparison is recorded — and persists `plausibilities`/`swaTier` in the run
summary.

**I-18 salary drawdown completion (#39, ch. 7.3):** `salaryProtection` now takes
the carried negative-commission balance and, in a positive month, *recovers* it
(previously it only accrued in a low month). Documented order (see open
question 11, now resolved): 10% storno withholding first (funds the separate
liability buffer), then the carried balance is drawn down from net pay **above
the guaranteed Fixum**, so salary protection still guarantees the Fixum floor
every month. The run reads each rep's `negativsaldo`, and freigabe posts the
signed delta (`negativsaldo_vorschuss` accrual / `negativsaldo_tilgung`
recovery) to the ledger and the rep balance.

**I-23 employee storno accounts (#44, ch. 10.1):** `sales_rep` gains four
cumulative running totals (`storno_privat_einbehalt`, `storno_gewerbe_einbehalt`,
`storno_clawback_genutzt`, `storno_freigegeben`) so the storno account is a real
posting object. The run now splits the 10% withholding into a private and a
commercial reserved share (proportional to the rep's private vs. commercial
commission) and freigabe posts them via `StornoAccountService.applyWithholding`.
`GET /api/storno-konten` (+ `/total`) exposes every ch. 10.1 field per employee
and in total — gesamtsaldo, privat/gewerbe reserved share, used clawbacks,
manually released, open receivables and freely-available (= balance − open
receivables). Founder may release part of an account
(`POST :repId/freigeben`, audited, ledger `storno_freigabe`).

**I-24 commercial reserve posting object (#45, ch. 10.2/10.3):** the 20% reserve
is now a persisted `commercial_reserve` posting object (per contract + run, rolls
up to a total), booked on freigabe from the real SWA receipt as
non-freely-available liquidity, in addition to the append-only ledger entry.
`GET /api/gewerbe-ruecklagen(/summary)` shows per-contract reserves and the total
with the **under-funding flag** (`reserve_actual < reserve_target` ⇒ `unterdeckt`);
Founder may correct the funded amount (`POST :id/ist`) and **release** a reserve
after contract end / final billing (`POST :id/freigeben`, ledger
`ruecklage_gewerbe_freigabe`).

**I-25 clawback receivable + offset ledger (#46, ch. 9.4/7.5):** SWA clawbacks
become persisted `clawback_receivable` posting objects. `ClawbackService.create`
computes the causer-accurate pass-through (`clawbackOffset`, pure) and offsets in
the fixed order — (1) storno account, (2) current commission, (3) open retention
commission — drawing the storno-account portion out of the account (I-23). Steps
(4) invoice to a departed employee and (5) collections are the disposition of any
remaining balance, tracked as the receivable's collections status
(`ausgeglichen`/`offen`/`rechnung`/`inkasso`); the remaining balance is always
reconstructable (`passThrough = Σ offsets + remaining`). `POST/GET /api/clawbacks`
(Founder/Backoffice create + record invoice/payment/escalation; read-only view).

**I-07 master-data admin UI (#28, ch. 4.1/12.1):** the Verwaltung screens now
edit every I-04 field. `VerkaeuferPage` maintains role, base salary (Fixum
basis), active status, directly-assigned trainer/team-lead (I-19), join/leave
dates and IBAN; `OrganisationenPage` maintains organisation type and, for partner
orgs, the partner compensation model; a new `StatusMasterPage`
(`/verwaltung/statusstammdaten`) releases valid-from-versioned status master
entries and seeds the defaults (I-06). All mutations are Founder/Admin only and
audited server-side (the existing `PUT`/`POST` master-data endpoints already
accept the new fields).

Migration `1721606400000-PostingObjects.ts` adds `commercial_reserve`,
`clawback_receivable` and the four `sales_rep` storno-breakdown columns
(`apps/api/src/posting-objects/`, a dedicated module wired into `CommissionsModule`
so freigabe can persist the objects). New pure functions carry worked-example
tests (`fachkonzept-engine.spec.ts`); the run orchestrator gains SWA-tier,
drawdown and storno-split tests (`fachkonzept-run.spec.ts`); the offset order and
storno-account math are unit-tested with mocked repos
(`test/posting-objects.service.spec.ts`); the e2e suite drives the storno/reserve
posting objects on freigabe and a full clawback offset cycle.

## Open Questions

1. **Resolved (assumption)**: `erfassungsdatum` missing/serial-0 defaults to the import
   batch's timestamp rather than rejecting the row; see `ImportService.importFile`.
2. **Resolved (assumption)**: a repeated `joules_id` **updates** the existing contract
   row in place (same id, new status/fields) rather than creating a new version; matches
   the domain, since a contract's status legitimately changes over time (e.g. → Widerruf).
3. **Still open**: org hierarchy is *not* walked for commission rule matching; a rule with
   an `organisationId` only matches contracts in that exact organisation (no parent/child
   traversal). Needs a decision before multi-level orgs rely on inherited rates.
4. **Still open**: real commission rates per product/organisation. All rates in seed data
   are placeholders; BlitzON must supply the actual rate table before the first real payout.
5. **Still open**: DATEV export column spec is a best-effort placeholder
   (`Belegnummer;Verkaeufer;IBAN;Vertrag;Kunde;Betrag;Typ;Periode`); needs the real
   column spec from the accountant before go-live. The export path is now built behind an
   `AccountingExporter` interface (`apps/api/src/commissions/export/`) specifically so the
   real DATEV mapping can be dropped in later without touching the controller/service.
6. **Still open**: whether a Joules API exists, or CSV/Excel upload (current implementation)
   remains the permanent integration path.
7. **Still open**: the contract status that indicates commission is "finally paid" versus a
   provisional booking; the current engine treats `ZAEHLT_STATUS` as commission-eligible
   without a separate "settled" concept.
8. **Still open**: inter-organization settlement logic when a contract's rep and the
   organisation being compensated differ across a hierarchy; per the Phase 3 spec, each
   organisation is modeled independently for now.
9. **Still open (infrastructure)**: actual Dev/Staging/Production hosting has not been
   provisioned; this environment has no cloud/hosting credentials. `docs/runbook.md`
   documents the procedures (environments, backups, restore drill) for whichever hosting
   target BlitzON chooses; provisioning itself is a handover task.
10. **Still open**: a formal retention/expiry policy for inactive Aussendienst logins (the
    DSGVO erasure endpoint exists and is manual/Admin-triggered today; no automatic
    expiry after offboarding).
11. **Resolved in Wave 2 (assumption, pending ch. 14.2 confirmation)**: salary drawdown is
    now implemented (I-18) — a carried `negativsaldo` is recovered from a later positive
    month. The order was decided as: 10% storno withholding **first** (separate liability
    buffer), then recovery from net pay **above the Fixum** so the Fixum floor is never
    breached. The exact ch. 14.2 euro figures/interaction should still be confirmed against
    the Fachkonzept before the first real payout; the invariants (two separate accounts,
    guaranteed floor, no mixing) are the certain part.
12. **Still open**: rep partner-vs-employee is derived from `organisation.org_typ =
    'partner'`; if partner status is ever per-rep rather than per-org this needs a rep-level
    flag. The commercial 12-month retention is persisted as a non-due `gewerbe_ruecklage`
    line and the reserve as a `commercial_reserve` posting object, but there is not yet a
    scheduler that releases either once the holding period / contract end elapses (release
    is a manual Founder action today: `POST /api/gewerbe-ruecklagen/:id/freigeben`).
13. **Still open (I-14)**: the SWA plausibility "actual" is read from
    `tatsaechliche_swa_provision` (falling back to `swa_gesamtprovision`); until the Joules/SWA
    booking-list sync exists (P2), that actual must be imported/entered manually, so most
    contracts show `offen` rather than `ok`/`abweichung` on a fresh run. The intermediate SWA
    tier steps between the documented anchors remain placeholders (versioned config).
