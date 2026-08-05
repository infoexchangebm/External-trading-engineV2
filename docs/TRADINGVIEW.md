# TradingView → Paper Broker Wiring

This describes the inbound path: a TradingView Pine Script alert fires a
webhook, the engine validates it, runs it through the risk engine, and (if
approved) fills a simulated order on the internal paper broker.

## Request contract

`POST /api/webhook/tradingview` (see `lib/api-spec/openapi.yaml` → `TradingViewAlert`):

```json
{
  "symbol": "BTCUSDT",
  "action": "buy",
  "price": 65000.5,
  "quantity": 0.01,
  "stopLoss": 64000,
  "takeProfit": 67000,
  "apiKey": "your API_KEY value"
}
```

- `symbol`, `action` are required. `action` is case-insensitive: `buy`/`long` → BUY,
  `sell`/`short` → SELL. Other values (e.g. `close`) are rejected with `400` -
  closing positions isn't wired through this endpoint yet.
- If `quantity` and `price` are both present and `> 0`, the alert is routed through
  the risk engine (`artifacts/api-server/src/lib/risk/risk-engine.ts`) and, if
  approved, filled on the paper broker
  (`artifacts/api-server/src/lib/brokers/paper-broker.ts`). If either is missing,
  the alert is logged only (`{"status":"received"}`) - unchanged from before.
- `stopLoss`/`takeProfit` are optional and passed straight to the broker.
- `apiKey` carries the shared secret. TradingView alert webhooks **cannot send
  custom HTTP headers** - only a URL and a JSON body - so the same secret normally
  sent as `X-API-Key` can be embedded in the body instead. Never share this value
  outside your own alert configuration.

### Response

- `{"status":"received", ...}` - logged only, not executed.
- `{"status":"executed", "tradeId", "brokerOrderId", "executedPrice"}` - filled by
  the paper broker.
- `{"status":"rejected", "rejectionReason"}` (HTTP 422) - blocked by the risk
  engine (position size, exposure cap, trade-frequency limit, circuit breaker, etc).
- `401` - missing/invalid `apiKey`. `400` - malformed payload or unsupported action.

Check what an alert actually did:

```bash
curl -H "X-API-Key: $API_KEY" http://localhost:8080/api/paper/positions
curl -H "X-API-Key: $API_KEY" http://localhost:8080/api/paper/balance
curl -H "X-API-Key: $API_KEY" http://localhost:8080/api/webhook/logs
```

## Example Pine Script (v5)

An EMA(20/50) crossover strategy, mirroring the engine's own technical scorer.
Paste this into TradingView's Pine Editor, add it to a chart, and treat it as a
starting point - backtest and adjust before trusting it.

```pinescript
//@version=5
strategy("Algo Signal Engine - EMA Cross Bridge", overlay=true,
     default_qty_type=strategy.fixed, default_qty_value=1, calc_on_every_tick=false)

// --- Inputs -----------------------------------------------------------------
apiKey    = input.string("", title="API Key (shared secret)", group="Webhook")
qty       = input.float(0.01, title="Order Quantity", minval=0.0001, group="Order")
slPercent = input.float(1.0, title="Stop Loss %", minval=0.0, group="Order")
tpPercent = input.float(2.0, title="Take Profit %", minval=0.0, group="Order")
fastLen   = input.int(20, title="Fast EMA Length", group="Strategy")
slowLen   = input.int(50, title="Slow EMA Length", group="Strategy")

// --- Indicators ---------------------------------------------------------------
emaFast = ta.ema(close, fastLen)
emaSlow = ta.ema(close, slowLen)

longCondition  = ta.crossover(emaFast, emaSlow)
shortCondition = ta.crossunder(emaFast, emaSlow)

plot(emaFast, "EMA Fast", color=color.teal)
plot(emaSlow, "EMA Slow", color=color.orange)

// --- Alert JSON, matching the /api/webhook/tradingview contract ---------------
buildAlert(_action) =>
    _sl = _action == "buy" ? close * (1 - slPercent / 100) : close * (1 + slPercent / 100)
    _tp = _action == "buy" ? close * (1 + tpPercent / 100) : close * (1 - tpPercent / 100)
    '{"symbol":"' + syminfo.ticker + '","action":"' + _action + '","price":' + str.tostring(close) +
      ',"quantity":' + str.tostring(qty) + ',"stopLoss":' + str.tostring(_sl) +
      ',"takeProfit":' + str.tostring(_tp) + ',"apiKey":"' + apiKey + '"}'

if longCondition
    strategy.entry("Long", strategy.long, qty=qty, alert_message=buildAlert("buy"))

if shortCondition
    strategy.entry("Short", strategy.short, qty=qty, alert_message=buildAlert("sell"))
```

### Creating the alert in TradingView

1. Add the script to a chart, fill in the `API Key` input with your `.env`
   `API_KEY` value (or a dedicated key if you rotate it).
2. Click **Alert** → **Condition**: select this script, **Order fills**.
3. In the alert dialog, set **Message** to exactly `{{strategy.order.alert_message}}`
   (TradingView substitutes the JSON string built above whenever an order fills).
4. Set **Webhook URL** to `http://<your-host>:8080/api/webhook/tradingview` and
   enable the webhook toggle.

### Important: TradingView cannot reach `localhost`

TradingView's alert servers run in TradingView's cloud - they cannot deliver
webhooks to `http://localhost:8080` on your machine. To receive real alerts you
need a publicly reachable URL in front of the API server, e.g. a tunnel
(`ngrok http 8080`, `cloudflared tunnel --url http://localhost:8080`) or a real
deployment. Setting that up is a separate, deliberate step - exposing a local
dev server to the internet has its own security considerations, so it's not
done automatically here.

Until then, verify the whole path locally by simulating what TradingView would
send:

```bash
curl -X POST http://localhost:8080/api/webhook/tradingview \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","action":"buy","price":65000,"quantity":0.01,"stopLoss":64000,"takeProfit":67000,"apiKey":"'"$API_KEY"'"}'
```
