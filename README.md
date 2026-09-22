# Laya Service

Self-hosted deployment of [Laya](https://github.com/receptron/laya) — an
open-weight decision model — with a management portal, an API-key-gated
inference endpoint, and admin key management.

## Stack

- **Hono** (`@hono/node-server`) + **TypeScript** — one service: inference API,
  admin API, and the portal (static).
- **PostgreSQL** + **Prisma** — API keys, usage, logs, audit, admin user.
- **React + Vite** — the portal SPA (in `web/`, built to `web/dist`, served by
  the app). _(coming next)_
- **`@receptron/laya`** — the model runtime, loaded once at boot (CPU).

## Auth

- **Caller API keys** (`laya_…`, stored hashed) → the inference endpoints.
- **Master secret** (`LAYA_ADMIN_SECRET`) → the admin API (scriptable).
- **Portal login** (signed-cookie session, admin seeded from env) → the UI.

## Local development

```bash
cp .env.example .env      # then edit the secrets
# start Postgres however you like, e.g. docker compose -f docker-compose.dev.yml up -d
npm install
npm run prisma:migrate:dev
npm run dev               # http://localhost:8080  (/health, /status)
```

First model load downloads ~1.7 GB of weights (cached to `LAYA_CACHE` or
`~/.cache/receptron-laya`), so `/status` reports `model: "loading"` until ready.

## Endpoints (current)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | liveness (deploy gate) |
| GET | `/status` | none | model state, uptime, memory |

Inference (`/v1/*`), admin (`/admin/*`), and auth (`/auth/*`) routers land in the
next increment. See `../notes/architecture.md` for the full planned surface.

## Deployment

Push to `main` → GitHub builds a Debian-slim image and pushes it to GHCR → the
home server's self-hosted runner pulls and recreates the stack (port **3080**,
public at `laya.yahia-lab.org`).

Files:
- `Dockerfile` — multi-stage, non-root, model in a chowned `/data/laya` volume.
- `docker-entrypoint.sh` — `prisma db push` then start (auto-creates tables).
- `docker-compose.yml` — `app` + `postgres`; lives on the server at `/opt/laya/`.
- `deploy/.env.server.example` — the secrets file to place at `/opt/laya/.env`.
- `.github/workflows/deploy.yml` — `test` → `build` (GHCR) → `deploy` (runner).

Server-side prerequisites (one-time): a self-hosted runner registered to this
repo with labels `self-hosted,home-server`, `/opt/laya/` created and owned by
`yahia` with a filled-in `.env`, and a Cloudflare tunnel route
`laya.yahia-lab.org → 192.168.1.21:3080`. See `../notes/`.
