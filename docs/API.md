# API Reference

This document summarizes the HTTP surface exposed by the two backend
services. The Express API server's contract is formally defined in
[`lib/api-spec/openapi.yaml`](../lib/api-spec/openapi.yaml) (OpenAPI 3.1) —
treat that file as the source of truth for exact request/response schemas.
This document is a human-readable companion, not a replacement.

## Authentication

- **Express API server**: when `API_KEY` is set, all routes under `/api`
  except health checks require an `X-API-Key` header matching `API_KEY`.
- **Python signal service**: all routes except `/health` and `/metrics`
  require the same `X-API-Key` header pattern, validated against its own
  `API_KEY` setting.
- Requests without a valid key receive `401 Unauthorized`.

## Rate Limiting and CORS

- The Express API server applies per-IP in-memory rate limiting, configured
  via `RATE_LIMIT_MAX` (requests) and `RATE_LIMIT_WINDOW_MS` (window size).
  Exceeding the limit returns `429 Too Many Requests`.
- CORS is restricted to the origins listed in `CORS_ORIGINS` (comma
  separated); if unset, it defaults to same-origin/localhost use.

## Express API Server (`/api`, default port `8080`)

### Health — `/api/healthz`

`GET /api/healthz` — public, no API key required.

Returns overall status plus subsystem detail:

```json
{
  "status": "ok",
  "subsystems": {
    "riskEngine": { "circuitBreakerOpen": false, "limits": { "...": "..." } },
    "scannerLoop": { "...": "scanner loop health..." },
    "brokerLayer": { "activeBrokers": ["paper", "oanda", "binance", "deriv", "icmarkets_fix", "mt5"] }
  },
  "timestamp": "2026-08-03T00:00:00.000Z"
}
```

`status` is `"degraded"` when the risk engine's circuit breaker is tripped,
otherwise `"ok"`.

### Signals — `/api/signals`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/signals` | List signal history. Query params: `symbol`, `finalSignal` (`BUY`\|`SELL`\|`NONE`), `limit` (default 50). |
| `GET` | `/api/signals/summary` | Aggregate counts (`totalSignals`, `buyCount`, `sellCount`, `noneCount`, `avgConfidence`), the 5 most recent signals, and a per-symbol breakdown. |
| `POST` | `/api/signals/generate` | Generate a new signal for a symbol. Body: `{ "symbol": "BTCUSDT", "sendToTradingView": false }`. Fetches live technical, orderbook, and macro data; computes a composite score and ATR-based stop-loss/take-profit; persists the signal; optionally sends it to TradingView. |

A `Signal` includes `finalSignal` (`BUY`/`SELL`/`NONE`), `confidence`,
`score`, `stopLoss`, `takeProfit`, per-component signals (`macroSignal`,
`orderbookSignal`, `earningsSignal`, `technicalSignal`), and raw metrics
(`rsi`, `macdHist`, `emaTrend`).

### Market Data — `/api/data`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/data/orderbook` | Orderbook imbalance per tracked symbol (from engine config). |
| `GET` | `/api/data/macro` | Macro climate: Fed stance, inflation, VIX, CPI, GDP signal. |
| `GET` | `/api/data/earnings` | Earnings calendar; uses Finnhub if `FINNHUB_API_KEY` is set, otherwise a small static fallback list. |

### Webhooks — `/api/webhook`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/webhook/tradingview` | Inbound TradingView alert. Validated and logged to `webhook_logs`. |
| `POST` | `/api/webhook/send` | Send a signal payload out to the configured TradingView webhook URL. |
| `GET` | `/api/webhook/logs` | List inbound/outbound webhook log entries. Query params: `limit`, `direction`. |

### Config — `/api/config`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/config` | Get engine configuration (symbols, per-component weights, threshold, TradingView URL, auto-send toggle). Auto-creates a default row on first access. |
| `PUT` | `/api/config` | Partially update engine configuration. |

### Scanner — `/api/scanner`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/scanner/health` | Background scanner loop health/diagnostics. |
| `POST` | `/api/scanner/start` | Start the scanner loop. Body: `{ "intervalMs": 60000 }` (optional). |
| `POST` | `/api/scanner/stop` | Stop the scanner loop. |
| `POST` | `/api/scanner/trigger` | Run a single scan cycle immediately; returns generated signals. |
| `GET` | `/api/scanner/news` | News items for tracked (or specified) symbols. |
| `GET` | `/api/scanner/rvol` | Relative-volume screener results. |
| `GET` | `/api/scanner/momentum` | Momentum screener results. |
| `GET` | `/api/scanner/options-flow?symbol=AAPL` | Options pressure/flow for a single symbol. |

### MT5 Bridge — `/api/mt5`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/mt5/heartbeat` | Heartbeat check used by the MT5 WebRequest connector. |
| `POST` | `/api/mt5/trade` | Submit a trade request from an MT5 EA. Body: `symbol`, `action`, `quantity`, `price`, `stopLoss`, `takeProfit`, `magicNumber`. Evaluated by the risk engine before routing to the `mt5` broker adapter; returns `422` with a rejection reason if risk checks fail. |
| `GET` | `/api/mt5/positions?symbol=...` | Fetch current positions from the MT5 adapter. |

### Risk — `/api/risk`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/risk/rules` | Current risk limits and circuit breaker state. |
| `PUT` | `/api/risk/rules` | Update risk limits at runtime. |
| `POST` | `/api/risk/circuit-breaker/trip` | Manually trip the circuit breaker. Body: `{ "reason": "..." }` (optional). |
| `POST` | `/api/risk/circuit-breaker/reset` | Manually reset the circuit breaker. |

See [`docs/RISK.md`](RISK.md) for the full set of enforced limits.

### Observability — `/api/observability`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/observability/soc-logs?limit=&category=` | Recent structured security/operations log entries. |
| `GET` | `/api/observability/metrics` | Runtime metrics snapshot. |

### Backtesting — `/api/backtesting`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/backtesting/run` | Run a historical strategy backtest. Body: `symbol` (required), `startDate`, `endDate`, `initialBalance`, `spreadPips`, `slippagePips` (all optional, with defaults). |

## Python Signal Service (default port `8000`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Liveness/readiness check. |
| `GET` | `/metrics` | Public | Runtime metrics snapshot for the Python service. |
| `POST` | `/webhook/tradingview` | `X-API-Key` | Receive and log an inbound TradingView alert. |
| `POST` | `/signal/send?symbol=...` | `X-API-Key` | Generate a signal for `symbol` using the Python strategy engine and dispatch it to TradingView if actionable. |

Internally, a scheduled job fetches macro and orderbook data plus live
Binance klines on an interval and generates/sends signals per configured
symbol; a separate daily job refreshes the earnings calendar.

## Error Format

Express routes generally return validation errors as:

```json
{ "error": "<zod validation message>" }
```

and unexpected failures as `500` with an `error`/`message` field. The Python
service returns FastAPI's standard `{"detail": "..."}` error shape, e.g. a
`401` for an invalid or missing `X-API-Key`.

## Regenerating Clients

The OpenAPI spec at `lib/api-spec/openapi.yaml` is the source of truth for
the Express API server. After editing it, regenerate the Zod schemas and
React Query hooks with:

```bash
pnpm --filter @workspace/api-spec run codegen
```
