# Security Policy

This project (Algo Signal Engine / External Trading Engine) can place and
manage real trading orders. Security issues here can have direct financial
impact — please report responsibly.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, report privately using one of the following:

- Open a [GitHub Security Advisory](https://github.com/infoexchangebm/External-trading-engineV2/security/advisories/new) on this repository (preferred), or
- Contact the maintainers directly through the repository owner's GitHub profile ([infoexchangebm](https://github.com/infoexchangebm)) requesting a private communication channel.

Please include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce, including affected endpoints, services (Python signal
  service vs. Express API server), or configuration.
- Any proof-of-concept code, logs, or requests (redact secrets and credentials).

You should expect an initial acknowledgement within a few business days.
Please allow time for a fix to be developed and released before any public
disclosure.

## Supported Versions

This project does not yet have tagged releases. Security fixes are applied to
the default branch. Once versioned releases begin, this section will be
updated with a support matrix.

## Scope

Security-relevant areas of this codebase include, but are not limited to:

- API key enforcement (`X-API-Key`) on the Express API server and the Python
  signal service.
- Rate limiting and CORS configuration on the Express API server.
- The risk engine (`artifacts/api-server/src/lib/risk/`) — loss limits,
  exposure caps, circuit breaker logic.
- Broker adapters (`artifacts/api-server/src/lib/brokers/`) and the MT5
  WebRequest bridge (`artifacts/api-server/src/routes/mt5.ts`).
- Webhook handling for inbound/outbound TradingView payloads.
- Secrets handling in `.env`, Docker images, and CI configuration.

## Hardening Recommendations for Operators

If you deploy this project, at minimum:

- Set a strong, unique `API_KEY` and rotate it periodically.
- Restrict `CORS_ORIGINS` to the exact origins you control — do not use a
  wildcard in production.
- Keep `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` tuned to your expected
  traffic to reduce abuse and denial-of-service risk.
- Terminate TLS in front of the services (Caddy/Nginx) — do not expose the
  API server or Python service directly to the internet over plain HTTP.
- Keep PostgreSQL and Redis bound to an internal Docker network, never
  publicly reachable.
- Rotate broker API keys/secrets (OANDA, Binance, Deriv, ICMarkets, MT5)
  regularly and store them only in your deployment environment's secret
  store, never in source control.
- Start with paper trading (see [`docs/RISK.md`](docs/RISK.md)) before
  connecting live broker credentials.

## Dependencies

This project depends on third-party packages (Node.js via `pnpm`, Python via
`pip`). Dependency vulnerabilities should be reported upstream when the issue
originates outside this codebase, but feel free to flag them here if they
affect this project's usage.
