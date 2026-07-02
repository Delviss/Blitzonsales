# Blitzonsales
A web platform that replaces two manual processes at BlitzON:  1. A monthly commission list maintained by hand in Google Sheets (the +50 / -50 list). 2. Manual filtering inside the Joules portal to decide which contracts count toward commission.

## Hosting status

There is **no cloud backend** (Railway or otherwise) connected to this
project — hosting has not been provisioned yet (see `PROGRESS.md`, open
question 9). The `main` branch auto-deploys the **frontend only** to GitHub
Pages (`.github/workflows/deploy-pages.yml`). That deployment has no backend
behind it, so login always fails there. To log in and use the platform, run
it locally with Docker (below).

## Getting started — one command (Docker)

With [Docker Desktop](https://www.docker.com/products/docker-desktop/)
installed and running, clone this repository and run from its root folder:

```bash
docker compose up -d --build
```

The first build takes a few minutes. It starts Postgres, Redis, the API and
the web app; migrations and the demo seed (bcrypt-hashed logins) run
automatically. Then open **http://localhost:8080** and log in with:

| Rolle        | E-Mail                   | Passwort        |
| ------------ | ------------------------ | --------------- |
| Admin / GF   | `admin@blitzon.de`       | `BlitzDev2026!` |
| Teamleiter   | `teamleiter@blitzon.de`  | `BlitzDev2026!` |
| Backoffice   | `backoffice@blitzon.de`  | `BlitzDev2026!` |
| Außendienst  | `verkauf@blitzon.de`     | `BlitzDev2026!` |

Stop everything with `docker compose down` (add `-v` to also wipe the
database). These credentials are for local demo use only.

## Local development (without the app containers)

Start only the databases (`docker compose up -d postgres redis`) and run the
API/web on your machine:

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
