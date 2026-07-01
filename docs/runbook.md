# Runbook: BlitzON Control

Operational reference for running BlitzON Control day to day and diagnosing problems.
For end-user instructions (rate changes, rep management, Datencheck) see the
German-language `docs/admin-guide.md`. For data protection specifics see
`docs/datenschutz.md`.

## 1. Environments

The codebase is environment-agnostic: everything is driven by `apps/api/.env`
(`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `REDIS_URL`, `PORT`) and the web
build-time variables `VITE_API_URL` / `VITE_BASE_PATH`. Three environments are
expected:

| Environment | Purpose | Data |
|---|---|---|
| Dev | Local development (`docker-compose up -d` for Postgres/Redis) | Seed data only (`npm run seed`) |
| Staging | Pre-production verification, demoed to BlitzON | **Anonymized** copy of production shape (see 1.1); never real customer data |
| Production | Live commission runs | Real data, EU-hosted, backed up (section 4) |

Provisioning the actual Staging/Production servers (hosting provider, DNS,
TLS termination, secrets storage) is an infrastructure decision outside this
repository's scope; this runbook documents the procedures once a target is
chosen; it is a handover task for BlitzON's ops team or hosting provider of choice.

### 1.1 Anonymizing data for Staging

Never copy a production database to Staging verbatim. Anonymize customer/rep
personal data first, e.g. by running the DSGVO erasure endpoint
(`POST /api/datenschutz/loeschantrag/:userId`, see `docs/datenschutz.md`) against
every login in the Staging copy, or by generating fresh synthetic data with
`npm run seed && npm run seed:load` (see section 5) instead of copying production
data at all: the latter is the safer default and is what this repo supports
out of the box.

## 2. CI Pipeline

`.github/workflows/ci.yml` runs on every push/PR to `main` with four jobs, each a
hard gate (a red job blocks merge):

1. **lint**: `npm run lint` (ESLint across `apps/*/src` and `packages/*/src`).
2. **api**: type-check (`tsc --noEmit`), unit tests (`npm test`, Jest), build
   (`nest build`).
3. **web**: production build (`vite build`).
4. **migrate-and-e2e**: spins up a throwaway Postgres 16 service container, runs
   `npm run migration:run` against it (catches broken migrations before merge),
   seeds fixtures, then runs the full HTTP-level end-to-end suite
   (`npm run test:e2e`, see section 3).

`.github/workflows/deploy-pages.yml` builds and deploys the web app to GitHub
Pages on push to `main` (used for the demo/preview environment only; production
deployment target is still to be decided, see section 1).

## 3. Testing

- **Unit tests** (`apps/api/src/**/*.spec.ts`, run via `npm test` in `apps/api`):
  pure-function coverage of the commission engine, import normalizer, dashboard
  aggregator, accounting exporters, RBAC scoping, 2FA-gated login, four-eyes
  approval, and the DSGVO export/erasure service. Run with mocked repositories,
  no database required.
- **End-to-end tests** (`apps/api/test/app.e2e-spec.ts`, run via `npm run test:e2e`):
  boots the real NestJS app against a real Postgres instance and drives it over
  HTTP with `supertest`. Covers: full monthly commission cycle (create → generate
  → four-eyes freigeben → export), 2FA enforcement rejecting a pending token,
  Aussendienst RBAC confinement, import validation, an admin rate change, and
  dashboard/frozen-run reconciliation.
  - **Requires a freshly migrated + freshly seeded database**: running it twice
    against the same database fails at the 2FA setup step (the fixture users
    already have 2FA enabled from the first run). This is exactly how the CI job
    runs it (fresh Postgres service container every time); locally, drop and
    recreate the database between runs.
  - Local setup:
    ```bash
    docker-compose up -d          # or a local Postgres matching apps/api/.env
    cd apps/api
    npm run migration:run
    npm run seed
    npm run test:e2e
    ```

## 4. Postgres backups

Once a hosting target is chosen, schedule:

- **Nightly full backup**: `pg_dump --format=custom` to an EU-region object
  store, retained 35 days.
- **Continuous WAL archiving** (if the hosting provider supports it) for
  point-in-time recovery within the retention window.
- **Quarterly restore drill**: restore the latest backup into a scratch database
  and run `npm run migration:run` against it to confirm the backup is usable and
  migrations still apply cleanly. Document the drill date and result here.

Recovery procedure:

```bash
pg_restore --clean --if-exists --dbname="$DATABASE_URL" backup.dump
cd apps/api && npm run migration:run
```

Because frozen commission runs are immutable and DATEV/Excel exports are
regenerated on demand from `commission_line` rows, a restore only needs the
database; there is no separate file-based state to recover.

## 5. Common operations

### Import a Joules export

Teamleiter/Backoffice/Admin: `/import` page, or `POST /api/import` (multipart,
field `file`). Accepts `.xlsx` or CSV. Rows with no recognisable `joules_id`
column are rejected outright (400); rows with an unrecognized rep or product name
are still imported but flagged in the returned `fehler` list for Backoffice
follow-up.

### Run the monthly commission cycle

See `docs/workflow.md` Flow A. In short: `POST /api/provisionslaeufe` (creates
**and** generates in one call) → review the draft → `POST :id/generate` again
any time to recompute while still `entwurf` → `POST :id/freigeben` (Admin/GF
only, **and must be a different user than whoever created the run**; four-eyes
is enforced server-side, returns 409 if violated) → export via
`GET :id/export/buchhaltung?format=csv` (or `?format=datev`, currently an
identical placeholder pending the real DATEV column spec, see open question in
`PROGRESS.md`), `GET :id/export/intern` (Excel, per-rep and per-org sheets), or
`GET :id/export/abrechnung/:repId` (per-rep PDF).

### Clear a Datencheck queue entry

See `docs/admin-guide.md` (German) for the Backoffice-facing walkthrough.

### Load-test with realistic volume

```bash
cd apps/api
npm run seed        # base orgs/reps/produkte/users
npm run seed:load    # +6 months x 12 reps x ~40 contracts/month synthetic data
npm run start:dev
k6 run -e BASE_URL=http://localhost:3001 ../../scripts/load-test.js
```

**Findings from the reference run** (≈2,900 contracts, 12 reps, single local
Postgres instance): `POST /api/provisionslaeufe` (create + generate) completed in
≈2s and `GET /api/dashboard` in well under 100ms at this volume. `generate()` in
`CommissionRunsService` does one `findOne` per contract to check for an existing
commission line (an N+1 query pattern): acceptable at low thousands of
contracts per run, but worth batching into a single query keyed by
`contractId` before running a run against a full year of high-volume data
(tens of thousands of contracts). Flagged here rather than "fixed" under time
pressure, since it works correctly today and a batching change deserves its own
review against real production volume expectations.

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Login returns `setup_required` unexpectedly | User's role (`admin_gf`/`backoffice`) requires 2FA and `twofaEnabled` is false | Expected on first login for that role; complete the QR/secret setup flow |
| `401` on a page that should be accessible | Access token carries a `purpose` claim (mid-2FA-challenge) | Complete `/auth/2fa/activate` or `/auth/2fa/verify-login` to get a full token |
| `403` on an endpoint a user believes they should reach | RBAC: Aussendienst is confined to their own data, Teamleiter to their own organisation | Confirm the intended role/scope; this is enforced by design, not a bug |
| Export route returns 409 | Run is not yet `freigegeben` | Exports only work on frozen runs |
| `freigeben` returns 409 unexpectedly | Four-eyes: the same user created and is trying to approve the run | Have a different Admin/GF approve it |
| CSV import rejects the whole file with 400 | No column in the file matched a known `joules_id` alias | Check the header row against `apps/api/src/import/import-normalizer.ts` |
| Migration step fails in CI | A migration has a syntax error or an incompatible `IF NOT EXISTS` assumption | Fix the migration; the `migrate-and-e2e` CI job runs against a clean database precisely to catch this before merge |
