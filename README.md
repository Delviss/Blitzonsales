# Blitzonsales
A web platform that replaces two manual processes at BlitzON:  1. A monthly commission list maintained by hand in Google Sheets (the +50 / -50 list). 2. Manual filtering inside the Joules portal to decide which contracts count toward commission.

## Getting started (local development)

The `main` branch auto-deploys the **frontend only** to GitHub Pages
(`.github/workflows/deploy-pages.yml`). That deployment has no backend behind
it, so login always fails there — to actually log in and use the platform,
run the full stack locally:

```bash
# 1. Postgres + Redis
docker-compose up -d

# 2. Shared types
cd packages/shared && npm ci && npm run build && cd ../..

# 3. API
cd apps/api
npm ci
npm run migration:run
npm run seed              # creates demo users, see apps/api/src/seed/seed.ts
npm run start:dev         # http://localhost:3001
```

In a second terminal:

```bash
cd apps/web
npm ci
npm run dev               # http://localhost:5173, proxies /api to :3001
```

Open http://localhost:5173 and log in with one of the seeded users, e.g.
`admin@blitzon.de` / `BlitzDev2026!`. `apps/api/.env` ships with
`REQUIRE_2FA=false` for local/demo use; set it to `true` to exercise the
mandatory TOTP 2FA flow for `admin_gf`/`backoffice` roles (see
`docs/runbook.md` section 6 for troubleshooting).
