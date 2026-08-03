# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once the first tagged release is cut.

## [Unreleased]

### Added
- Python signal service entrypoint (`run.py`) running FastAPI via `uvicorn`, configurable through `HOST`, `PORT`, and `LOG_LEVEL`.
- `pydantic-settings`-based configuration for the Python service, loading values from `.env`.
- API key authentication (`X-API-Key` header, `API_KEY` env var) on both the Python service and the Express API server, with health endpoints kept public.
- Per-IP in-memory rate limiting on the Express API server (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`).
- Configurable CORS allowlist on the Express API server via `CORS_ORIGINS`.
- Security headers and a JSON body size limit on the Express API server.
- Live Binance klines price data source for the Python service so technical scoring reflects real market data.
- ATR-based stop-loss / take-profit level calculation in generated signals.
- `/health` and `/metrics` endpoints on the Python signal service.
- Pytest test suite under `tests/`.
- GitHub Actions CI workflow running `ruff`, `pytest`, TypeScript typechecking, and a Docker build.
- Hardened, multi-stage, non-root Docker image for the Python signal service (`Dockerfile`), plus dedicated `docker/api-server.Dockerfile` and `docker/dashboard.Dockerfile` used by `docker-compose.yml`.
- `Makefile` with `setup`, `dev`, `test`, `lint`, `fmt`, `docker-up`, and `docker-down` targets.
- Project community and governance files: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, issue/PR templates.

### Changed
- Documentation overhauled to reflect the two-service architecture (Node.js/Express API server plus Python/FastAPI signal service).

### Security
- Introduced API key enforcement, rate limiting, and a CORS allowlist across externally reachable services.

[Unreleased]: https://github.com/infoexchangebm/External-trading-engineV2/compare/main...HEAD
