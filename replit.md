# External Trading Engine

A full-stack automated trading engine dashboard. Monitors multi-signal trade decisions (macro, orderbook, earnings, technical), stores signal history, and sends alerts to TradingView via webhook.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/trading-engine run dev` — run the React dashboard (port 24212)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `FRED_API_KEY`, `ALPHAVANTAGE_API_KEY`, `FINNHUB_API_KEY` — enrich macro/earnings data

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Frontend: React + Vite + Wouter + TanStack Query + Recharts
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (signals, webhook_logs, engine_config)
- `artifacts/api-server/src/routes/` — Express route handlers (signals, data, webhook, config)
- `artifacts/api-server/src/lib/` — strategy engine, orderbook/macro fetchers, TradingView sender
- `artifacts/trading-engine/src/` — React dashboard (Dashboard, Signals, Market Data, Webhooks, Settings)

## Architecture decisions

- Strategy engine scores signals from four components (macro 25%, orderbook 30%, earnings 15%, technical 30%) with configurable weights stored in the DB
- TradingView integration is bidirectional: inbound alerts POST to `/api/webhook/tradingview`, outbound signals send to the configured webhook URL
- All webhook events (inbound and outbound) are logged to `webhook_logs` table for debugging
- Engine config (symbols, weights, threshold, auto-send) lives in the DB so it survives restarts and is editable from the Settings page
- Technical signal uses live price data (Binance and Yahoo Finance) to compute RSI, MACD, EMA trends, and ATR values for dynamic stops/targets.

## Product

- **Dashboard** — live summary cards (total/BUY/SELL counts, avg confidence), recent signal feed, macro climate panel, orderbook imbalance bars
- **Signals** — full history table with symbol/type filters, manual signal generation with optional TradingView send
- **Market Data** — orderbook imbalance per symbol, macro (Fed/inflation/VIX/CPI/GDP), earnings calendar
- **Webhooks** — inbound/outbound event log, manual signal sender, webhook URL instructions
- **Settings** — symbol list, signal weight sliders, threshold, TradingView URL, auto-send toggle

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Binance API returns HTTP 451 from Replit environments (geo-blocked). Orderbook fetcher falls back to NEUTRAL with 0% imbalance — this is expected behavior until a proxy or alternative data source is configured.
- `macroSignal` on a Signal row is `BULLISH|BEARISH|NEUTRAL` (the engine's interpretation). `fedSignal` on MacroData is `DOVISH|HAWKISH|NEUTRAL` (the raw Fed stance). These are different fields — do not conflate them.
- Engine config is a single-row table (id=1). `ensureConfig()` in `config.ts` creates the default row on first access.
- Always run `pnpm run typecheck:libs` after changing any `lib/*` package before running artifact typechecks.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
