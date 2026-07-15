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

## Wave 3 (Data ingestion, Epic P2) — I-08 / I-09 / I-10 / I-11 / I-12

The parallel ingestion track. Two channels — the Joules/SWA API and Excel/CSV
uploads — now funnel through one shared, immutable, data-quality-gated write
path. I-08 is **externally blocked** on a BlitzON test-tenant credential, so the
Excel path (I-12) is the interim source and nothing else is gated on the API.

**I-10/I-11 shared ingestion backbone (`apps/api/src/ingestion/`):** the cross-
channel core. `IngestionArchiveService` (+ `ingestion_archive`) stores a
byte-for-byte raw copy with a SHA-256 of every API fetch and every file import
(I-10, ch. 12.2), served back verbatim via `GET /api/ingestion/archive(/:id/raw)`.
`ContractUpsertService` is the single write path (I-11): it upserts **keyed on the
SWA order number** (falling back to the Joules id) so a returning order updates
the contract as a new version — never a duplicate — appends an append-only status
event on every status change and a `swa_actual` financial event on a changed
actual commission (I-03), and runs the pure data-quality classifier
(`ingestion-validation.ts`, unit-tested). A record with a hard problem (missing
order number, unknown/absent rep, unknown org, missing commercial term,
invalid/absent surcharge, invalid status) is routed to the `ingestion_error` list
and the contract is **gated** (`contract.datenqualitaet_gesperrt`) — the
Fachkonzept run skips gated contracts, so a flagged record gets no automatic
booking until it is corrected. An unverifiable SWA figure is surfaced but does
not block (the I-14 plausibility control still books the expected value).
`DataQualityService` (`GET /api/data-quality`) surfaces the last sync, open error
rows, unknown reps/orgs, unassignable orders and the gated-contract count.

**I-08 Joules/SWA API client (`apps/api/src/joules/joules-client.ts` + schemas +
mapper):** a typed `fetch`-based client for the RESTful API v2 (base
`https://service.billig-will-ich.de/service/v2`) with configurable HTTP-Basic /
`api-key` auth, retries with exponential backoff on 5xx/network errors and
rate-limit (429) handling that honours `Retry-After`. Read endpoints:
`/clients/ids/{status}`, `/clients/{id}`, `/clients/{id}/status`,
`/consumption/{id}`, `/cancellation/{id}`,
`/organizations/{id}/commissionsettings`, statuses. A pure mapper
(`joules-mapper.ts`, unit-tested) translates the ClientSchema (+ consumption +
cancellation) into the shared upsert record; a present cancellation overrides the
status to Storno so reversals surface. The client is env-configured
(`JOULES_*`); with no credential it is *not configured* rather than throwing.
Retry, rate-limit, auth-header and mapper behaviour are unit-tested with an
injected `fetch`/`sleep`.

**I-09 sync job (`joules-sync.service.ts` + controller + scheduler):** a delta
sync driven by `GET /clients/ids/{status}` across the known status set — fetch
each client + consumption (+ cancellation, tolerating a 404), map, archive the
raw payloads (I-10), then upsert idempotently through the shared write path
(I-11). Each run records what changed in a `sync_run` row (the "last sync"
surface). On-demand via `POST /api/sync/joules`; an opt-in interval scheduler
(`JOULES_SYNC_ENABLED`, off by default) covers the scheduled case without a new
dependency. With no credential a run completes as `nicht_konfiguriert` with a
clear message. Orchestration is unit-tested with a mocked client.

**I-12 Excel/settlement fallback + historical migration (`apps/api/src/import/`):**
the existing Excel/CSV contract import now archives the raw file (I-10) and
funnels through `ContractUpsertService`, so the fallback path archives, upserts by
order number and gates exactly like the API. A new **settlement-list** import
(`POST /api/import/abrechnung`, `import-normalizer` alias set) takes the SWA
commission list keyed on the order number, writes the actual commission (the I-14
booking truth) and appends a `swa_actual` financial event; unmatched orders are
reported for reconciliation. A pure at-risk classifier
(`historical-migration.ts`, unit-tested) implements the ch. 4.2 migration set —
private within the 6-month storno window; commercial with an open 2nd SWA half,
open retention, open reserve or possible under-consumption — exposed as
`GET /api/import/at-risk` (required set vs. archive-only) so go-live can prove the
required historical set reconciles.

Web: a new **Datenqualität** page (`/datenqualitaet`) shows the last sync, the
gated-contract / open-error counts, the error categories and the error list, with
an on-demand "Jetzt synchronisieren" action (and the not-configured hint).
Migration `1722211200000-Wave3Ingestion.ts` adds `ingestion_archive`,
`ingestion_error`, `sync_run` and the two `contract` columns. Coverage: pure
unit tests for the validation classifier, the Joules client (retry/rate-limit/
auth), the mapper, the sync orchestrator and the at-risk classifier; the e2e
suite drives a Joules-export import (archive + gating + data-quality view), a
settlement-list import, the not-configured sync run and the at-risk report.

**Still to build (Phase 1 remainder):** the master-data admin UI polish (I-07 is
done), the Founder dashboard & drill-downs (P6), month-end close & the warning
system (P8). I-08's live authentication remains blocked on the BlitzON
test-tenant credential (see open question 6).

## Wave 4 (Live views + acceptance gates) — I-16 / I-22 / I-26 / I-31 / I-32

The running-month projection, the ch. 14 acceptance gate, and the CRM lead-time
follow-up. All shipped with unit + e2e coverage; only I-31/I-32 needed new
storage (migration `1722816000000-Wave4LiveViewsGates.ts`).

**I-16 forecast / preview (#37, ch. 11.3):** a live provisional projection from
the current data. `apps/api/src/forecast/` reuses the *exact* run computation via
a new non-persisting `FachkonzeptRunService.preview(periode, organisationId)`
(the private `compute` was refactored to `computeForPeriod` so a run and a
forecast can never diverge), then layers a per-rep tier projection and reversal
warnings on top (`forecast.ts`, pure + unit-tested). `projectRepTier` models the
retroactive switch — 10×€70 now, with the next-threshold *potential* being the
uplift across the whole month once the 40th qualifies (40×€90 − 10×€70) — and the
company-wide SWA tier carries its next threshold. `projectReversals` surfaces
every Storno/Widerruf in the period as a negative-impact warning with the SWA
figure at risk. Everything is explicitly `provisorisch: true` with a "nothing is
payable until the SWA list confirms" note. `GET /api/forecast?periode=JJJJ-MM`
(default current month, Founder/Backoffice/read-only); web page `/forecast`
(`ForecastPage.tsx`), clearly labelled provisional, with the tier-progress table
and the reversal warnings.

**I-22 acceptance tests ch. 14.2 & 14.3 (#43):**
`commissions/fachkonzept/acceptance-14.spec.ts` pins every ch. 14.2 salary/
balance/storno row (P = 1,800 / 2,100 / 2,300 / 10,000 / 20,000: the guaranteed
Fixum floor, the 10% storno withholding into the separate account, negative-
balance accrual in a low month and recovery from pay above the Fixum in a high
month) and every ch. 14.3 commercial row (total commission 120,000 kWh × 4 ct =
€4,800, the 25/25 employee and 35/35 partner splits, both SWA halves confirmed in
one month via the run orchestrator, and an under-consumption clawback pass-through
offset in the fixed order). The euro figures follow the documented invariants
(see open question 11); the suite is a single CI gate.

**I-26 manual storno-credit release (#47, ch. 7.5 / 10.1):** storno credit is
never auto-paid. `StornoAccountService.release` now requires an amount, a release
date, the approving person and a **mandatory reason** (rejected without one), and
records all of them in the audit log and the append-only ledger
(`storno_freigabe`). The release surface moved to Founder/Backoffice
(`POST /api/storno-konten/:repId/freigeben`). The inactive-lock: `RunRep` gained
`aktiv` + `offeneRisiken`, and the run holds an inactive rep's standard payout
(`auszahlung = 0`, `auszahlungGesperrt = true`, warning) while open risks remain —
the commission is still computed and the storno withholding still accrues; only
the cash-out is blocked, to be released later via a manual freigabe. Web page
`/stornokonten` (`StornoKontenPage.tsx`) shows the ch. 10.1 breakdown and a
release dialog capturing amount/date/approver/reason.

**I-31 lead-time rule (#52, ch. 5.3 / 16):** `crm/lead-time.ts` (pure, unit-
tested) evaluates an intake against the configurable lead time (`ConfigKey.
LeadTimeDays`, default 365). The delivery start is the day after the pre-contract
ends; a breach (`deliveryStart − intake > leadTimeDays`) yields the exact SWA
rejection reason **"Vorlaufzeit zu lang"** and the first admissible intake day
(`deliveryStart − leadTimeDays`).

**I-32 Wiedervorlage + email (#53, ch. 5.3 / 13 / 17):** on a breach
`WiedervorlageService` schedules a follow-up for the first admissible day and a
due-processor emails Founder/Backoffice on/after that day. The **binding worked
example passes exactly** (pre-contract ending 01.10.2027 ⇒ follow-up due
02.10.2026) at the unit, service and e2e level. The mail transport is bound
behind an `EMAIL_SENDER` token; the default `LoggingEmailSender` records every
message to a new `email_outbox` table (verifiable/auditable) since the concrete
sender/recipient list is an open input (recipients default to every Founder/
Backoffice user, overridable via `WIEDERVORLAGE_EMAIL_RECIPIENTS`). Dispatch is
idempotent (never double-sends). Surfaces: `POST /api/intake/pruefen`,
`GET /api/wiedervorlagen`, `POST /api/wiedervorlagen/prozess-faellige` (also an
opt-in daily scheduler, `WIEDERVORLAGE_SCHEDULER_ENABLED`),
`POST /api/wiedervorlagen/:id/erledigt`; web page `/wiedervorlagen` with the
intake check + follow-up list.

## Wave 5 (Governance) — I-34 / I-35 / I-36 / I-17

The immutability + oversight layer of Epic P8. All shipped with pure unit tests,
service/HTTP coverage and web surfaces; migration
`1723420800000-Wave5Governance.ts` adds the two new tables (`month_close`,
`manual_override`).

**I-34 month-end close & freeze (#55, ch. 12.3 / 5.2):** an explicit close per
billing month after which that month's volumes/tiers/payouts/KPIs are immutable.
`apps/api/src/month-close/`: `MonthCloseService.close(periode)` reuses the exact
run computation (`FachkonzeptRunService.preview`, never a divergent number) to
freeze a **snapshot** of the month's figures and record the set of
commissionable contract ids at close; `reopen(periode, grund)` is
Founder/Admin-only, requires a reason and is audited (as is `close`). The freeze
is enforced in `FachkonzeptRunService`: `create` / `generate` / `freigeben` all
reject a closed month (409), so a frozen month's booked figures never change.
Later SWA information surfaces as an **addendum** in the current open month:
`computeFachkonzeptRun` gained an `addenda` input (pure), and the run service
picks up non-gated contracts whose capture month is an earlier *closed* month and
that were not yet booked, tags every resulting line with the original month + SWA
order number (`istAddendum` / `urspruungsMonat`), and never reopens the closed
month. A still-non-qualifying carryover stays silent (no €0 placeholder).
`GET/POST /api/monatsabschluss(/:periode)(/reopen)`; web page `/monatsabschluss`.

**I-35 warning & check system (#56, ch. 13 + 8 / 9.1):** the Founder dashboard's
red/yellow/info checks. `apps/api/src/warnings/warnings.ts` is the pure rule set
(each check unit-tested against its ch. 13 action): **red** — payout > related
SWA revenue (block/flag, manual release with reason), commercial reserve actual <
target, surcharge over cap (Strom 4 ct / Gas 2 ct), SWA tier deviates from the
control tier, unknown rep/org or missing order number; **yellow** — employee with
a negative balance, retention due in 30/60/90 days, storno/correction within the
liability window, lead-time customer contactable again; **info** — next tier level
reachable. `WarningsService` loads the live data (reusing the run preview for
per-contract payout + per-rep tier progress, the persisted commercial reserves
for under-funding, the versioned config for the caps + storno window) and returns
the ranked list with per-level counts. `GET /api/warnungen?periode=JJJJ-MM`; web
page `/warnungen`.

**I-36 manual overrides + audit (#57, ch. 12.2 / 12.1):** a fully-auditable
manual correction that never hides the original SWA value. `apps/api/src/overrides/`:
`OverrideService.overrideContractSwa` sets the contract's `manueller_override`
(the value the run now books — the engine reads `manuellerOverride ??
tatsaechlicheSwaProvision ?? swaGesamtprovision`) while leaving the original SWA
figures in place, and writes a reconstructable trail: an append-only
`manual_override` row (actor / timestamp / old / new / original SWA / mandatory
reason / optional document), an offsetting `correction` financial-ledger entry
referencing the original month + order number, and an audit-log entry. Reason is
mandatory; all corrections are Founder/Backoffice-only.
`POST /api/commission/:id/override` + `GET /api/commission/:id/override` (shows
the original next to the effective value and the trail).

**I-17 acceptance tests ch. 14.1 (#38):**
`commissions/fachkonzept/acceptance-14-1.spec.ts` pins every ch. 14.1 case: the
39 → €70 (€2,730) / 40 → €90 (€3,600, the 40th recomputes the whole month) / 80 →
€100 (€8,000) retroactive staffel (I-15), electricity + gas as two separate
qualified counts, a below-minimum 900 kWh private contract not counted (I-13),
and the July-negative → August-positive contract booked only as an August
addendum tagged with the frozen July month while a recompute of July stays
byte-for-byte identical (I-34). A single CI gate.

## Wave 6 (Surfacing + final gate) — I-27 / I-28 / I-29 / I-30 / I-37

The Founder-facing surfacing layer of Epic P6 and the Phase-1 release gate of
Epic P8. All figures are net by default; everything reuses the exact run
computation (`FachkonzeptRunService.preview`) and the persisted posting objects
so nothing on the dashboard diverges from the eventual booking. Two new modules
(`apps/api/src/founder/`, `apps/api/src/akzeptanz/`), three new web pages, one
shared net/gross labelling helper. No migration (read-only surfacing).

**I-29 net presentation & gross-salary labelling (#50, ch. 2/18):** the
cross-cutting UI convention applied as the Wave-6 views were built.
`apps/web/src/components/NetLabels.tsx` is the single place the convention lives:
`eurNet()` formats every KPI/drill-down euro value, `<NettoBadge>` marks a net
section, `<BruttolohnBadge>`/`·brutto` unmistakably marks the only gross concept
(guaranteed gross salary / Fixum basis — a payroll figure, never a VAT-gross
amount), and `<NetHint>` carries the standing "alle Beträge netto" note at the
top of each view. Every tile/table in the new pages is net; salary bases are
labelled gross-salary; partner payouts are shown net.

**I-27 Founder KPI tiles incl. free liquidity (#48, ch. 11.1):**
`founder/kennzahlen.ts` holds the pure roll-ups (`computeFreeLiquidity`,
`rollupEmployees`, `rollupPartners`, `rollupCommercial`, unit-tested in
`kennzahlen.spec.ts`); `KennzahlenService` loads the live data (current + prior
+ YTD previews, storno-account total, commercial-reserve summary, open
clawbacks, warnings counts, data-quality overview, versioned Fixum/employer-cost)
and assembles the ch. 11.1 tiles: **SWA revenue** (current/prior/YTD, confirmed
vs. expected), **new customers & SWA tier**, **internal employees** (commission,
net payout, gross-salary basis, negative balance, employer cost, storno
withholding, contribution margin), **partners** (revenue, net payout, open
retention, BlitzON margin), **commercial** (total commission, 1st/2nd SWA
halves, open retention, reserve target/actual, under-funding, risks),
**warnings**, **data quality**, and — the anchor tile — **free operating
liquidity**: confirmed SWA revenue minus due payouts, employer cost, the storno
buffer, bound commercial reserves and open clawback receivables (reserves reduce
free liquidity, ch. 18), with every component broken out so the figure is fully
transparent. `GET /api/kennzahlen?periode=JJJJ-MM`, Founder/Backoffice/read-only;
web page `/kennzahlen` (`KennzahlenPage.tsx`).

**I-30 real-time / forecast view (#51, ch. 11.3, builds on I-16):** the Founder
dashboard carries the live tier progress and the immediate financial impact of
reversals. The KPI payload embeds an `echtzeit` block (from the existing
`ForecastService`): the per-rep retroactive-staffel projection with next-threshold
potential, the aggregate reversal impact and count, all explicitly
`provisorisch: true`. Surfaced on `/kennzahlen` (a "vorläufig" banner + the live
staffel table, each rep linking into its drill-down) with a link across to the
full `/forecast` view; reversals/status changes after a sync show at once.

**I-28 drill-downs to the SWA order number (#49, ch. 11.2/18):**
`founder/drilldown.service.ts` + `GET /api/drilldown/{monat/:periode | rep/:repId
| organisation/:orgId | vertrag/:contractId | ruecklagen}`. The single acceptance
criterion is traceability, so every contract-level row every drill-down emits
carries its `swaOrderNumber`, and the **contract** drill-down (the leaf) exposes
the full append-only status + financial ledger history, the computed commission
lines, reserves, clawbacks and CRM follow-ups keyed on that number. Month
(volume, status split, SWA tier, expected vs. actual, payouts, corrections from
the ledger), Rep (contracts, qualified new, tier, earnings, gross-salary basis,
negative balance, storno account, retention, clawbacks, contribution),
Organisation (contracts, SWA revenue, employee/partner cost, commercial claims,
storno, reserves, BlitzON margin — explicitly no central fixed-cost allocation in
Phase 1) and Reserves (storno accounts + commercial reserves per person / contract
/ due date / use). Web page `/drilldown` (`DrilldownPage.tsx`, tabbed, deep-linkable
via query params; SWA-order chips drill straight into the contract leaf).

**I-37 export + 11 acceptance criteria (#58, ch. 18 — the release gate):**
`GET /api/kennzahlen/export?periode=` writes the net KPI snapshot as a flat
CSV (the run-level accounting/Excel/PDF exporters remain the per-contract path,
reused unchanged). `apps/api/src/akzeptanz/` is the gate itself: `akzeptanz.ts`
defines the 11 ch. 18 criteria as a pure, testable checklist (traceability to
order number, SWA list as truth, net-by-default, no payout before confirmation,
retroactive tiers pass, minimum/non-qualifying/existing handled, separate balance
vs. storno account, reserves reduce free liquidity, clawbacks with offsetting
order, immutable months + visible addenda, clear free operating liquidity + key
warnings — each naming its implementing issue). `acceptance-18.spec.ts` pins that
all 11 pass with the invariants met and that a regression flips exactly its
criterion red. `AkzeptanzService` evaluates the checklist against live signals:
the traceability criterion is checked against real data (no non-gated contract
may be booked without an SWA order number) and the free-liquidity criterion
re-derives the reserve-reducing figure; the structural invariants are additionally
guarded by the CI acceptance suites (14.1/14.2/14.3, clawback-offset,
month-close freeze). `GET /api/akzeptanz?periode=`; web page `/akzeptanz`
(`AkzeptanzPage.tsx`, live red/green checklist). The e2e suite drives the KPI
tiles (incl. the free-liquidity identity), the CSV export, the month drill-down's
per-order traceability, the reserves drill-down, the 11-criteria gate and the
RBAC confinement of all four surfaces.

**Epics P1–P8 (#14–#21):** with I-27…I-30 and I-37 landed the Epic P6 (Founder
dashboard) and Epic P8 (governance + release readiness) sub-issues are complete;
the epics close as their remaining sub-issues do.

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
    tier steps between the documented anchors remain placeholders (versioned config). The
    settlement-list import (I-12, `POST /api/import/abrechnung`) is now the fallback way to load
    the actual figures until the API sync is live.
14. **Still open (I-08, externally blocked)**: the Joules API client's field names
    (`joules-schemas.ts`) mirror the I-02 ClientSchema extension but are best-effort pending the
    authoritative `doc.yaml` and a test-tenant credential (the host may also need allow-listing).
    Everything is optional so a partial/unexpected payload still maps; the field mapper is the one
    place to adjust when the real schema lands. No credential ⇒ the sync reports
    `nicht_konfiguriert` and the Excel path stays the source.
15. **Still open (I-11, assumption)**: an *unverifiable* SWA commission (no actual figure yet, or a
    deviation beyond tolerance) is surfaced in the data-quality list but does **not** block booking
    — the expected tier value still books per the I-14 plausibility control. Only hard data problems
    (missing order number, unknown/absent rep, unknown org, missing commercial term, invalid
    surcharge/status) gate a contract from automatic booking. Confirm this split against the
    Fachkonzept before go-live.
16. **Still open (I-34, assumption)**: months are expected to be closed in chronological
    order. An addendum from a closed month is booked in the first open run after its origin
    month; closing that run's month records the contract in its booked set so it is not
    re-added later. The addendum is booked at the current open month's applicable staffel
    rate and counts toward that month's tier (the frozen origin month is never recomputed).
    Confirm the addendum's tier treatment against ch. 14.1 before the first cross-month
    payout. I-35's SWA "control tier" is left unset (per-contract plausibility already
    flags SWA deviations); wire the authoritative control-tier value when supplied.
17. **Still open (I-27, assumption)**: the **free operating liquidity** figure is
    defined as confirmed SWA commission received minus due payouts, employer cost,
    the storno-account buffer, bound (unreleased) commercial reserves and open
    clawback receivables — every component is broken out on the tile so the number
    is transparent. This treats the storno buffer and reserves as liquidity-reducing
    liabilities (ch. 18) and uses the current month's confirmed SWA commission as the
    single inflow. Confirm the exact inflow/obligation set (esp. whether prior-month
    carryover cash and released reserves re-enter the figure) against the Fachkonzept
    before it drives a real cash decision. Employer cost on partner payouts is treated
    as nil (partners are not salaried); the KPI export is a net CSV snapshot, with the
    per-contract accounting/Excel/PDF exporters unchanged as the booking export path.
