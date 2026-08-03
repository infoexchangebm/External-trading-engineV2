# Deployment

This guide covers deploying the Algo Signal Engine / External Trading Engine
with Docker Compose, and notes for a VPS/production setup.

> Before deploying with real broker credentials, read
> [`docs/RISK.md`](RISK.md) and start with paper trading.

## Docker Images

The project builds three container images:

| Image | Dockerfile | Purpose |
|---|---|---|
| Python signal service | `Dockerfile` (repo root) | Hardened, multi-stage, non-root image running `python run.py` (uvicorn) |
| Express API server | `docker/api-server.Dockerfile` | Node.js/TypeScript API server used by `docker-compose.yml` |
| React dashboard | `docker/dashboard.Dockerfile` | Static/served build of the dashboard used by `docker-compose.yml` |

## Docker Compose

`docker-compose.yml` defines the following services:

- `postgres` — PostgreSQL 16, with a healthcheck (`pg_isready`).
- `redis` — Redis 7, with a healthcheck (`redis-cli ping`).
- `api-server` — the Express API server, built from the root `Dockerfile`
  context, exposed on port `8080`, with a healthcheck against
  `GET /api/healthz`.
- `trading-engine-ui` — the dashboard, exposed on port `24212`, depends on
  `api-server`, and receives `VITE_API_URL` pointing at the API server.

```bash
cp .env.example .env
# edit .env: set DATABASE_URL/REDIS_URL overrides if needed, API_KEY,
# CORS_ORIGINS, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, broker credentials, etc.
docker compose up --build -d
```

Check service health:

```bash
docker compose ps
curl http://localhost:8080/api/healthz
```

Bring the stack down:

```bash
docker compose down
```

Or with the Makefile:

```bash
make docker-up
make docker-down
```

> The Python signal service is not currently wired into `docker-compose.yml`
> as a service; run it separately (locally or as its own container built
> from the root `Dockerfile`) if you need scheduled live signal generation
> outside of the Express API server.

## Environment Variables

See the [environment variable table in the README](../README.md#environment-variables)
for the full list. At minimum for production:

- `DATABASE_URL`, `REDIS_URL` — point at your managed/production instances
  or the Compose-provided `postgres`/`redis` services.
- `API_KEY` — required in production; enforced via `X-API-Key` on both
  services (health endpoints remain public).
- `CORS_ORIGINS` — set to your actual dashboard origin(s); do not leave this
  as a wildcard.
- `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` — tune to your expected traffic.
- Broker credentials (`OANDA_*`, `BINANCE_*`, `DERIV_APP_ID`,
  `ICMARKETS_FIX_*`, `MT5_WEB_REQUEST_TOKEN`) — only populate the ones for
  brokers you intend to use, and rotate them regularly.

## Production Checklist

- [ ] HTTPS enabled (terminate TLS in front of the services)
- [ ] `API_KEY` set and rotated
- [ ] `CORS_ORIGINS` restricted to known origins
- [ ] Rate limiting tuned (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`)
- [ ] Webhook secret / TradingView payload validation configured
- [ ] Database backups enabled
- [ ] Reverse proxy configured (Caddy / Nginx) in front of `api-server` and
      `trading-engine-ui`
- [ ] Docker restart policy enabled (`docker-compose.yml` uses
      `restart: unless-stopped`)
- [ ] Health checks monitored (`/api/healthz`, Python service `/health`)
- [ ] Broker API keys rotated and stored as secrets, not committed to source
- [ ] Firewall rules applied — only 80/443 exposed publicly; Postgres/Redis
      restricted to the internal Docker network
- [ ] Started in paper-trading mode before enabling any live broker adapter

## VPS Deployment Notes

For a single-VPS deployment:

1. Install Docker and Docker Compose.
2. Clone the repository and create `.env` from `.env.example`.
3. Put a reverse proxy (Caddy or Nginx) in front of `trading-engine-ui`
   (port `24212`) and `api-server` (port `8080`), terminating TLS.
3. Run `docker compose up --build -d`.
4. Confirm `GET /api/healthz` returns `status: "ok"` and that
   `docker compose ps` shows all services healthy.
5. If running the Python signal service, deploy it as an additional
   container (built from the root `Dockerfile`) or a systemd-managed
   process running `python run.py`, and point its `TRADINGVIEW_WEBHOOK_URL`
   / API integration at your Express API server as needed.

## CI/CD

`.github/workflows/ci.yml` runs on push and pull request:

- `ruff check .` — Python lint
- `pytest` — Python test suite
- TypeScript typecheck (`pnpm typecheck`)
- Docker build (validates the Dockerfiles build successfully)

A green CI run does not deploy anything automatically — deployment is a
manual `docker compose up --build -d` (or your own CD pipeline) against the
target host.
