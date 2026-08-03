# Risk

## This Is Not Financial Advice

The Algo Signal Engine / External Trading Engine is software for generating
and routing trading signals. It is provided for educational and engineering
purposes. Nothing in this repository, its documentation, or its output
constitutes financial, investment, tax, or legal advice. Trading foreign
exchange, commodities, equities, and cryptocurrencies carries a substantial
risk of loss and is not suitable for every investor. You are solely
responsible for any trading decisions and their outcomes.

**Use paper trading (the `paper` broker adapter) or a broker's demo/sandbox
environment first**, and do not connect real capital until you understand
exactly how signals are generated, how the risk engine behaves, and how
failures are handled.

## Risk Engine

The Express API server includes a risk engine
(`artifacts/api-server/src/lib/risk/risk-engine.ts`, class `RealRiskEngine`)
that every trade request is evaluated against before being routed to a
broker adapter or the MT5 bridge (see `artifacts/api-server/src/routes/mt5.ts`).

### Configurable Limits

| Limit | Field | Default | Purpose |
|---|---|---|---|
| Max daily loss | `maxDailyLossUsd` | `1000` (via `MAX_DAILY_LOSS_USD`) | Trips the circuit breaker once cumulative daily realized loss reaches this amount |
| Max weekly loss | `maxWeeklyLossUsd` | `3000` (via `MAX_WEEKLY_LOSS_USD`) | Trips the circuit breaker once cumulative weekly realized loss reaches this amount |
| Max position size | `maxPositionSizeUsd` | `50000` (via `MAX_POSITION_SIZE_USD`) | Rejects a single order whose notional exceeds this cap |
| Max asset exposure | `maxAssetExposureUsd` | `100000` (via `MAX_ASSET_EXPOSURE_USD`) | Rejects orders that would push a single symbol's open exposure over this cap |
| Max FX / Gold / Oil exposure | `maxFxExposureUsd`, `maxGoldExposureUsd`, `maxOilExposureUsd` | `200000` / `100000` / `100000` | Per-asset-class exposure caps |
| Max trades per hour | `maxTradesPerHour` | `10` (via `MAX_TRADES_PER_HOUR`) | Rate limits trade frequency across the engine |
| Max spread | `maxSpreadPips` | `3.0` (via `MAX_SPREAD_PIPS`) | Rejects trades when the quoted spread is too wide |
| Max ATR multiplier | `maxAtrMultiplier` | `2.5` | Rejects trades during abnormal volatility spikes (current ATR vs. baseline ATR) |
| News blackout window | `newsBlackoutMinutesBefore` / `After` | `15` / `15` | Blocks trading around high-impact news events |

Limits can be read and updated at runtime via `GET/PUT /api/risk/rules`.

### Evaluation Order

`evaluateTradeRisk()` checks, in order: circuit breaker state, daily loss
limit, weekly loss limit, max position size, per-symbol exposure, per-asset
class exposure, trade frequency, spread, volatility (ATR ratio), and news
blackout windows. The first failing check rejects the trade with a
`rejectionReason`; passing all checks records the trade timestamp for rate
limiting.

### Circuit Breaker

The circuit breaker (`isCircuitBreakerTripped`) halts all new trades once
tripped — automatically (daily/weekly loss breach) or manually via
`POST /api/risk/circuit-breaker/trip`. It must be explicitly reset via
`POST /api/risk/circuit-breaker/reset` before trading resumes. Treat a
tripped circuit breaker as a signal to investigate before resetting it.

### ATR-Based Stop-Loss / Take-Profit

The strategy engine (`artifacts/api-server/src/lib/engine/strategy-engine.ts`)
derives stop-loss and take-profit levels from the Average True Range (ATR) of
the instrument, using configurable `atrSlMultiplier` and `atrTpMultiplier`
weights (defaults `1.5` and `3.0`) stored in engine config. These levels are
attached to generated signals but the risk engine does not currently enforce
that a broker order includes them — enforcing SL/TP at the broker/adapter
level is the operator's responsibility.

## Operational Risk Controls

Beyond the risk engine, be aware of:

- **State machine tracking** — trades move through
  `INIT → VALIDATED → EXECUTED → MANAGED` (or `ERROR`) states
  (`artifacts/api-server/src/lib/statemachine/trade-state-machine.ts`), giving
  visibility into where a trade failed.
- **SOC logging** — risk and execution events are logged via
  `artifacts/api-server/src/lib/observability/soc-logger.ts` and viewable via
  `GET /api/observability/soc-logs`.
- **Scanner loop health** — `GET /api/scanner/health` and
  `GET /api/healthz` report whether the background scanning loop and broker
  layer are healthy; monitor these in production.
- **Data confidence** — generated signals carry a `dataConfidence` score
  reflecting how much live data (vs. missing/fallback data) informed the
  signal. Treat low-confidence signals with extra caution.
- **Geo-blocked market data** — the Binance orderbook/klines fetchers can
  receive HTTP 451 responses from geo-restricted environments; in that case
  the affected component falls back to a neutral/zero-confidence reading
  rather than fabricating data. Do not assume a neutral reading always means
  a neutral market.

## Broker and Bridge Risk

- Broker adapters (`artifacts/api-server/src/lib/brokers/`) include a
  `paper` adapter for simulated trading — use this first for any new
  strategy or configuration change.
- The MT5 bridge (`POST /api/mt5/trade`) accepts trade requests from an
  external MT5 Expert Advisor. Protect this endpoint with `API_KEY` and
  `MT5_WEB_REQUEST_TOKEN`, and ensure the EA only talks to this service over
  a trusted network path.
- Live broker credentials (OANDA, Binance, Deriv, ICMarkets FIX) should be
  scoped to the minimum permissions required and rotated regularly (see
  [`SECURITY.md`](../SECURITY.md)).

## Recommended Rollout

1. Run with the `paper` broker adapter and validate signal quality and risk
   engine behavior over a meaningful sample period.
2. Move to a broker's demo/sandbox account (e.g., OANDA practice account)
   with small size limits configured in the risk engine.
3. Only after both stages behave as expected, and with tightened risk limits
   appropriate to your capital, consider enabling a live broker adapter —
   and continue monitoring `/api/healthz`, `/api/risk/rules`, and SOC logs
   closely.

This document describes the risk *controls* present in the code as of this
writing. It is not a guarantee against loss, software bugs, data outages, or
broker-side failures.
