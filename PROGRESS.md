# BlitzON Control — Implementation Progress

## Phases

- [x] **Phase 0** — Repo scaffold, domain types, workflow docs, docker-compose
- [x] **Phase 1** — NestJS API (auth, master data CRUD, audit), React web app
- [ ] **Phase 2** — Commission rule engine, Provisionslauf, DATEV export
- [ ] **Phase 3** — Excel import pipeline (Joules export normalization)
- [ ] **Phase 4** — Datacheck workflow, multi-user approval
- [ ] **Phase 5** — Reporting dashboards, PDF Abrechnungsblatt

## Open Questions

1. When `erfassungsdatum` is missing (Excel serial 0), use import timestamp or reject?
2. What happens when a `joules_id` appears in two consecutive imports — update or create new version?
3. How is the org hierarchy used for commission splitting in Phase 2?
4. 2FA enforcement: mandatory for all roles or only Admin/GF?
5. Export format for DATEV: CSV column spec needed from accountant.
