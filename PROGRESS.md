# BlitzON Control — Implementation Progress

## Phases

- [x] **Phase 0** — Repo scaffold, domain types, workflow docs, docker-compose
- [x] **Phase 1** — NestJS API (auth, master data CRUD, audit), React web app
- [x] **Phase 2** — Commission rule engine, Provisionslauf, DATEV export
- [x] **Phase 3** — Excel import pipeline (Joules export normalization)
- [ ] **Phase 4** — Datacheck workflow, multi-user approval
- [ ] **Phase 5** — Reporting dashboards, PDF Abrechnungsblatt

Phase 2: `apps/api/src/commissions/` — `commission-engine.ts` (pure rule-matching/clawback
logic, unit tested), `CommissionRulesService`/Controller (`/api/provisionsregeln`, CRUD,
Admin/GF only), `CommissionRunsService`/Controller (`/api/provisionslaeufe`): create a
draft run for a `periode` (`JJJJ-MM`) + optional `organisationId`, `POST :id/generate` to
(re)compute draft lines (idempotent while `entwurf`), `POST :id/freigeben` to approve
(Admin/GF only, freezes the run), `GET :id/export/datev` (CSV, semicolon-delimited,
German decimal comma) and `GET :id/export/intern` (.xlsx, detail + per-rep summary sheet),
both gated to `freigegeben` runs. Web pages: Provisionsregeln (verwaltung), Provisionsläufe
(list + detail with generate/freigeben/export actions).

Phase 3: `apps/api/src/import/` — `import-normalizer.ts` (pure header-alias matching, Excel
serial/German-date parsing, unit tested), `ImportService`/Controller (`POST /api/import`,
multipart upload, Teamleiter/Backoffice/Admin-GF). Reads both real `.xlsx` workbooks and
CSV/plain-text exports (CSV is decoded as UTF-8 before parsing so umlauts in headers/values
survive — verified against a mojibake bug found during smoke testing). Web page: `/import`.

## Open Questions

1. **Resolved (assumption):** `erfassungsdatum` missing/serial-0 defaults to the import
   batch's timestamp rather than rejecting the row — see `ImportService.importFile`.
2. **Resolved (assumption):** a repeated `joules_id` **updates** the existing contract
   row in place (same id, new status/fields) rather than creating a new version — matches
   the domain, since a contract's status legitimately changes over time (e.g. → Widerruf).
3. **Still open:** org hierarchy is *not* walked for commission rule matching — a rule with
   an `organisationId` only matches contracts in that exact organisation (no parent/child
   traversal). Needs a decision before multi-level orgs rely on inherited rates.
4. 2FA enforcement: mandatory for all roles or only Admin/GF? (unrelated to Phase 2/3.)
5. **Still open:** DATEV export column spec is a best-effort placeholder
   (`Belegnummer;Verkaeufer;IBAN;Vertrag;Kunde;Betrag;Typ;Periode`) — needs the real
   column spec from the accountant before go-live.
