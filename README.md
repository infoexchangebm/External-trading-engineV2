# Algo Signal Engine (External Trading Engine)

[![CI](https://github.com/infoexchangebm/External-trading-engineV2/actions/workflows/ci.yml/badge.svg)](https://github.com/infoexchangebm/External-trading-engineV2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/)
[![Node.js 20+](https://img.shields.io/badge/node-20%2B-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> **This is a real trading system.** It can generate and route live trading signals to brokers and TradingView. It is **not financial advice**. Always start with **paper trading** and a broker's demo/sandbox environment, and read [`docs/RISK.md`](docs/RISK.md) before enabling any live execution path.

## High-Level Summary

- **External multi-signal trading engine** — ingests TradingView alerts and internal strategy output, scores them, and routes execution to broker adapters.
- **Two cooperating services** — a Node.js/TypeScript API server (primary orchestrator, dashboard backend) and a Python/FastAPI signal service (live market data scoring, scheduled scanning).
- **Risk-managed execution** — a dedicated risk engine enforces loss limits, exposure caps, volatility filters, and news blackout windows before any order reaches a broker.
- **Broker adapters + optional MT5 bridge** — pluggable adapters for paper trading, OANDA, Binance, Deriv, an ICMarkets FIX connector, and an MT5 WebRequest bridge.

A full-stack automated trading engine designed to ingest TradingView alerts, normalise signals, apply strategy/risk rules, and route execution to broker adapters. It ships with a React dashboard for real-time monitoring of multi-signal trade decisions (macro, orderbook, earnings, technical).

## Why This Exists

- **Modular & external** — acts as an external orchestration layer rather than a single broker-bound bot, so it can sit in front of any broker or bridge.
- **Multi-strategy** — combines technical indicators, macroeconomic data, orderbook imbalances, and earnings signals into one composite score.
- **Risk-managed** — centralises risk controls across all incoming signals before they ever reach a broker.
- **TradingView-compatible** — first-class support for inbound and outbound TradingView webhook alerts.
- **MT5-optional** — can act as the "brain" while an MT5 Expert Advisor / bridge handles execution.

## Tech Stack

| Layer | Technology |
|---|---|
| API server | Node.js 20+, TypeScript 5.9, Express 5 |
| Signal service | Python 3.11+, FastAPI, uvicorn, APScheduler |
| Frontend dashboard | React, Vite, Wouter, TanStack Query, Recharts |
| Mobile | React Native (Expo) |
| Database | PostgreSQL + Drizzle ORM |
| Cache | Redis |
| Validation | Zod, pydantic / pydantic-settings |
| API contract | OpenAPI 3.1 (`lib/api-spec/openapi.yaml`), codegen via Orval |
| Data sources | Binance, Yahoo Finance, FRED, Finnhub |
| Package management | pnpm workspaces (Node), pip / `requirements.txt` (Python) |
| Deployment | Docker, Docker Compose, Caddy/Nginx |
| CI | GitHub Actions (ruff, pytest, tsc, docker build) |

### API Server (Node.js / Express)
- Receives TradingView alerts and manual dashboard input.
- Normalises signals into a standard schema.
- Scores macro, orderbook, earnings, and technical data.
- Applies risk rules via the risk engine.
- Routes execution to broker adapters or the MT5 bridge.
- Persists everything to PostgreSQL.

### Signal Service (Python / FastAPI)
- Independent scheduled process (`python run.py`) that fetches live market data and computes technical scores.
- Pulls OHLC candles from Binance to drive Wilder RSI, EMA(20/50) trend, and ATR calculations.
- Computes ATR-based stop-loss / take-profit levels for generated signals.
- Exposes its own `/health` and `/metrics` endpoints, and an API-key-protected signal/webhook surface.

### Frontend (Dashboard)
- Reads from PostgreSQL via the API server.
- Displays live signals, macro climate, and orderbook imbalance.
- Allows manual signal injection and engine configuration.
- Provides system telemetry (SOC logs, metrics snapshots, scanner health).
- **Light / dark / system theming** — a switch in the header persists your choice to `localStorage` and follows the OS while set to *System*. The theme is applied before first paint, so reloading in dark mode never flashes white.

## Architecture

```mermaid
flowchart TD
    TV[TradingView Alerts] -->|POST /api/webhook/tradingview| Webhook[Webhook Handler]
    Manual[Manual Dashboard Input] --> Webhook
    Scheduler[APScheduler Jobs] --> PySignal

    subgraph PyService[Python Signal Service - FastAPI]
        PySignal[Signal Generation]
        Binance[(Binance Klines)] --> PySignal
        Macro1[Macro / Earnings Fetchers] --> PySignal
    end

    Webhook --> Normalisation[Signal Normalisation]

    subgraph NodeEngine[Node.js Strategy & Risk Engine]
        Normalisation --> Macro[Macro Data Scorer]
        Normalisation --> Orderbook[Orderbook Scorer]
        Normalisation --> Tech[Technical Scorer]
        Macro & Orderbook & Tech --> Composite[Composite Score + ATR SL/TP]
        Composite --> Risk[Risk Engine: limits, exposure, circuit breaker]
    end

    PySignal -.->|/api/webhook/tradingview or shared DB| Normalisation

    Risk -->|Approved Orders| Adapters[Broker Adapters: paper, OANDA, Binance, Deriv, FIX]
    Risk -->|Approved Orders| MT5[MT5 WebRequest Bridge]

    Adapters --> Market[Market / Positions]
    MT5 --> Market

    DB[(PostgreSQL)] -.- NodeEngine
    Redis[(Redis)] -.- NodeEngine
    Dashboard[React Dashboard] -.- DB
    Dashboard -.->|REST, X-API-Key| NodeEngine
```

## Folder Structure

```text
.
├── app/                          # Python signal service: data sources, strategy engine, TradingView sender
├── config/                       # Python pydantic-settings configuration (reads .env)
├── run.py                        # Python service entrypoint (uvicorn)
├── artifacts/api-server/         # Express API backend: routes, engine, brokers, risk, observability
├── artifacts/trading-engine/     # React dashboard frontend
├── artifacts/signal-mobile/      # React Native (Expo) mobile app
├── lib/api-spec/                 # OpenAPI 3.1 spec (single source of truth for API contracts)
├── lib/api-client-react/         # Generated React Query hooks (Orval codegen)
├── lib/api-zod/                  # Generated Zod schemas (Orval codegen)
├── lib/db/                       # Drizzle ORM schema and DB client
├── docker/                       # Dockerfiles for the API server and dashboard
├── docs/                         # Architecture, deployment, API, and risk documentation
├── scripts/                      # Setup, testing, and utility scripts
├── tests/                        # Python pytest suite
├── Dockerfile                    # Hardened multi-stage image for the Python signal service
└── docker-compose.yml            # Postgres, Redis, API server, dashboard, and (optionally) the Python service
```

## Quick Start

### Option A: Docker Compose (recommended)

```bash
cp .env.example .env
# edit .env with your keys and secrets
docker compose up --build -d
```

This starts PostgreSQL, Redis, the Express API server (`docker/api-server.Dockerfile`), and the dashboard (`docker/dashboard.Dockerfile`). Check status with:

```bash
curl http://localhost:8080/api/healthz
```

### Option B: Local Node.js / pnpm (API server + dashboard)

This project is a pnpm monorepo.

```bash
pnpm install
cp .env.example .env
pnpm --filter @workspace/db run push        # push DB schema (dev only)
pnpm --filter @workspace/api-server run dev # API server on :8080
pnpm --filter @workspace/trading-engine run dev # dashboard on :24212
```

The dashboard calls the API same-origin at `/api/*`. In development, Vite proxies
those calls to `http://localhost:8080`; point it elsewhere with
`API_PROXY_TARGET`. In production the same job is done by `docker/nginx.conf`,
so the SPA uses relative URLs in both cases.

Regenerate typed API hooks/schemas after editing the OpenAPI spec:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Codegen pins `query.version: 5` in `lib/api-spec/orval.config.ts`. Orval infers
the TanStack Query major from the package.json beside its config, and
`@workspace/api-spec` does not depend on `@tanstack/react-query` — without the
pin it silently falls back to v4 output and makes `queryKey` mandatory at every
call site.

#### Building

```bash
pnpm run typecheck   # every package
pnpm run build       # typecheck, then build every package
```

`pnpm run build` includes `@workspace/signal-mobile`, whose build produces a
hosted Expo Go deployment and therefore needs a public HTTPS domain in
`EXPO_PUBLIC_DOMAIN` (or a Replit domain) to bake absolute URLs into the Expo
manifests. To build everything else:

```bash
pnpm -r --filter "!@workspace/signal-mobile" --if-present run build
```

#### Platform support

Development is supported on Linux, macOS, and Windows. `pnpm-workspace.yaml`
excludes native binaries for platforms the project does not target, keeping
installs small — but `win32-x64` is deliberately kept so Vite/Rollup/Tailwind
builds work on Windows. These are optional, `os`/`cpu`-gated dependencies, so
Linux and macOS installs skip them at no cost.

`PORT` and `BASE_PATH` are injected by Replit; elsewhere both Vite configs fall
back to defaults (dashboard `24212`, mockup sandbox `24213`, base `/`) instead
of failing, and both still honour the environment variables when set.

### Option C: Local Python virtual environment (signal service)

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python run.py
```

The Python service reads configuration via `pydantic-settings` from `.env` (or process environment) and starts a `uvicorn` server. Configure the bind address and port with `HOST`, `PORT`, and log verbosity with `LOG_LEVEL`.

### Using the Makefile

Common tasks are wrapped in a `Makefile`:

```bash
make setup      # create venv + install Python deps, pnpm install
make dev        # run API server + dashboard + Python service for local dev
make test       # pytest + (typecheck where applicable)
make lint       # ruff check . + pnpm typecheck
make fmt        # format Python and TypeScript sources
make docker-up  # docker compose up --build -d
make docker-down # docker compose down
```

## Environment Variables

Copy `.env.example` to `.env` and configure as needed. Variables below are read by either the Python signal service, the Express API server, or both.

| Variable | Used by | Default | Description |
|---|---|---|---|
| `PORT` | Python service, API server | `8080` (API), `8000` (Python) | Port the service listens on |
| `HOST` | Python service | `0.0.0.0` | Bind address for the Python uvicorn server |
| `NODE_ENV` | API server | `production` | Node environment mode |
| `LOG_LEVEL` | Python service, API server | `INFO` | Log verbosity |
| `DATABASE_URL` | API server | `postgres://trading:trading_secret@localhost:5432/trading_engine` | PostgreSQL connection string |
| `REDIS_URL` | API server | `redis://localhost:6379` | Redis connection string |
| `MAX_DAILY_LOSS_USD` | Risk engine | `1000` | Max cumulative daily loss before the circuit breaker trips |
| `MAX_WEEKLY_LOSS_USD` | Risk engine | `3000` | Max cumulative weekly loss before the circuit breaker trips |
| `MAX_POSITION_SIZE_USD` | Risk engine | `50000` | Max notional size per position |
| `MAX_ASSET_EXPOSURE_USD` | Risk engine | `100000` | Max notional exposure per symbol |
| `MAX_TRADES_PER_HOUR` | Risk engine | `10` | Rate limit on trade frequency |
| `MAX_SPREAD_PIPS` | Risk engine | `3.0` | Reject trades when spread exceeds this |
| `FRED_API_KEY` | Macro data | _(optional)_ | FRED macroeconomic data |
| `ALPHAVANTAGE_API_KEY` | Macro/technical data | _(optional)_ | Alpha Vantage market data |
| `FINNHUB_API_KEY` | Earnings/scanner data | _(optional)_ | Finnhub earnings calendar and news |
| `OANDA_API_KEY` / `OANDA_ACCOUNT_ID` | Broker adapter | _(optional)_ | OANDA broker credentials |
| `BINANCE_API_KEY` / `BINANCE_SECRET` | Broker adapter, price data | _(optional)_ | Binance credentials (klines fetch works without keys for public data) |
| `DERIV_APP_ID` | Broker adapter | _(optional)_ | Deriv broker app ID |
| `ICMARKETS_FIX_HOST` / `ICMARKETS_FIX_PORT` / `ICMARKETS_SENDER_COMP_ID` | Broker adapter | _(optional)_ | ICMarkets FIX connection |
| `MT5_WEB_REQUEST_TOKEN` | MT5 bridge | _(optional)_ | Shared secret validating MT5 EA WebRequest calls |
| `TRADINGVIEW_WEBHOOK_URL` | Webhook sender | _(optional)_ | Outbound TradingView alert URL |
| `SYMBOLS` | Engine | `EURUSD,GBPUSD,XAUUSD,AAPL,SPY,CL=F,BTCUSD` | Default tracked symbols |
| `API_KEY` | Python service, API server | _(required in production)_ | Shared secret required in the `X-API-Key` header for protected endpoints; health endpoints stay public |
| `RATE_LIMIT_MAX` | API server | _(implementation default)_ | Max requests per IP per window for the Express rate limiter |
| `RATE_LIMIT_WINDOW_MS` | API server | _(implementation default)_ | Rate limit window size, in milliseconds |
| `CORS_ORIGINS` | API server | same-origin / localhost | Comma-separated list of allowed CORS origins |

> Values above reflect `.env.example` plus configuration the API server and Python service read at runtime. Treat all secrets (`API_KEY`, `MT5_WEB_REQUEST_TOKEN`, broker credentials) as production secrets — never commit a populated `.env`.

## API Endpoints

All Express routes are mounted under `/api` (see `lib/api-spec/openapi.yaml` for the full OpenAPI 3.1 contract). Endpoints other than health checks require the `X-API-Key` header when `API_KEY` is configured.

| Route group | Path prefix | Examples |
|---|---|---|
| Health | `/api/healthz` | `GET /api/healthz` — engine, risk, scanner, broker status |
| Signals | `/api/signals` | `GET /api/signals`, `GET /api/signals/summary`, `POST /api/signals/generate` |
| Market data | `/api/data` | `GET /api/data/orderbook`, `GET /api/data/macro`, `GET /api/data/earnings` |
| Webhooks | `/api/webhook` | `POST /api/webhook/tradingview`, `POST /api/webhook/send`, `GET /api/webhook/logs` |
| Config | `/api/config` | `GET /api/config`, `PUT /api/config` |
| Scanner | `/api/scanner` | `GET /api/scanner/health`, `POST /api/scanner/{start,stop,trigger}`, `GET /api/scanner/{news,rvol,momentum,options-flow}` |
| MT5 bridge | `/api/mt5` | `GET /api/mt5/heartbeat`, `POST /api/mt5/trade`, `GET /api/mt5/positions` |
| Risk | `/api/risk` | `GET /api/risk/rules`, `PUT /api/risk/rules`, `POST /api/risk/circuit-breaker/{trip,reset}` |
| Observability | `/api/observability` | `GET /api/observability/soc-logs`, `GET /api/observability/metrics` |
| Backtesting | `/api/backtesting` | `POST /api/backtesting/run` |

The Python signal service exposes its own surface separately (default port `8000`):

| Path | Description |
|---|---|
| `GET /health` | Liveness/readiness check (public) |
| `GET /metrics` | Runtime metrics snapshot |
| `POST /webhook/tradingview` | Inbound TradingView alert (requires `X-API-Key`) |
| `POST /signal/send` | Generate and dispatch a signal for a symbol (requires `X-API-Key`) |

See [`docs/API.md`](docs/API.md) for full request/response details.

## Testing

```bash
pytest              # Python test suite (tests/)
ruff check .         # Python lint
pnpm typecheck       # TypeScript typecheck across all workspace packages
```

GitHub Actions CI (`.github/workflows/ci.yml`) runs `ruff`, `pytest`, `tsc` typechecking, and a Docker build on every push and pull request.

## Security

- **API key authentication** — both the Python service and the Express API server require an `X-API-Key` header matching `API_KEY` on all non-health endpoints.
- **Rate limiting** — the Express server applies per-IP in-memory rate limiting (`RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW_MS`).
- **CORS allowlist** — configure `CORS_ORIGINS` with a comma-separated list of allowed origins; defaults to same-origin/localhost.
- **Security headers** and a **JSON body size limit** are applied on the Express server to reduce common HTTP attack surface.
- **Webhook secrets** — validate inbound TradingView payloads before trusting them.
- **Firewall rules** — only expose ports 80/443 publicly; keep PostgreSQL/Redis on an internal network.

See [`SECURITY.md`](SECURITY.md) for the vulnerability disclosure process and [`docs/RISK.md`](docs/RISK.md) for trading-specific risk controls.

## Roadmap

- Expand automated test coverage across broker adapters and the risk engine.
- Persist Python-service-generated signals directly into the shared PostgreSQL schema.
- Add authenticated WebSocket/streaming updates to the dashboard.
- Broaden CI to include integration tests against a containerized Postgres/Redis.

## License

Licensed under the [MIT License](./LICENSE).

## Further Reading

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system architecture and data flow
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Docker Compose and VPS deployment
- [`docs/API.md`](docs/API.md) — API reference
- [`docs/RISK.md`](docs/RISK.md) — risk engine and trading risk disclaimer
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to contribute
