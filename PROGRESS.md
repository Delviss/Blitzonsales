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

**Still to build (Phase 1 remainder):** persisting the engine outputs into runs,
the Joules/SWA API client & sync (P2, I-08…I-12), the master-data admin UI (I-07),
the Founder dashboard & drill-downs (P6), CRM/lead-time follow-up (P7),
month-end close & the warning system (P8). The exact ch. 14.2 salary euro
figures and the full SWA new-customer tier table need the authoritative
Fachkonzept document (the tracker truncates the long issue bodies) — the salary
function is implemented to the certain invariants and the SWA tier keeps only its
documented anchors (0–99 €160 … 300+ €205) with placeholder intermediate steps,
all as versioned config so the real tables drop in without code changes.

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
