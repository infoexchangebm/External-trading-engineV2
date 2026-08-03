# Contributing

Thanks for your interest in improving the Algo Signal Engine / External
Trading Engine. This document covers how the repository is organized and how
to get a change merged.

Please also read the [Code of Conduct](CODE_OF_CONDUCT.md) and, before
touching anything execution- or risk-related, [`docs/RISK.md`](docs/RISK.md).

## Repository Layout

This is a mixed pnpm monorepo (Node.js/TypeScript) plus a standalone Python
service:

- `artifacts/api-server/` — Express API server (routes, strategy engine,
  broker adapters, risk engine, observability).
- `artifacts/trading-engine/` — React dashboard.
- `artifacts/signal-mobile/` — React Native (Expo) mobile app.
- `lib/api-spec/openapi.yaml` — single source of truth for the API contract;
  `lib/api-zod` and `lib/api-client-react` are generated from it.
- `lib/db/` — Drizzle ORM schema.
- `app/`, `config/`, `run.py` — Python signal service (FastAPI, APScheduler).
- `tests/` — Python pytest suite.
- `docs/` — architecture, deployment, API, and risk documentation.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how these pieces fit
together.

## Getting Started

Follow the [Quick Start](README.md#quick-start) section of the README to set
up both the Node.js/pnpm side and the Python virtual environment, or use:

```bash
make setup
```

## Development Workflow

1. Create a branch off `main` for your change.
2. Make your change, keeping it focused and scoped to one concern.
3. If you change `lib/api-spec/openapi.yaml`, regenerate clients:
   ```bash
   pnpm --filter @workspace/api-spec run codegen
   ```
4. If you change the Drizzle schema, run:
   ```bash
   pnpm --filter @workspace/db run push
   ```
5. Run the checks below locally before opening a pull request.
6. Open a pull request using the provided template, describing what changed
   and why, and linking any related issue.

## Required Checks

All of the following must pass (these also run in CI, see
`.github/workflows/ci.yml`):

```bash
pytest              # Python tests
ruff check .         # Python lint
pnpm typecheck       # TypeScript typecheck across all workspace packages
```

Or via the Makefile:

```bash
make test
make lint
```

Format code before committing:

```bash
make fmt
```

## Commit and PR Guidelines

- Keep commits focused; prefer several small commits over one large one.
- Write clear commit messages describing the "why", not just the "what".
- Update `CHANGELOG.md` under the `[Unreleased]` section for any
  user-facing change (new endpoint, new env var, behavior change).
- Update relevant docs (`README.md`, `docs/*.md`) when you change
  configuration, endpoints, or architecture.
- Never commit secrets, `.env` files, or real broker/API credentials.

## Reporting Bugs and Requesting Features

Use the issue templates:

- [Bug report](.github/ISSUE_TEMPLATE/bug_report.yml)
- [Feature request](.github/ISSUE_TEMPLATE/feature_request.yml)

For security vulnerabilities, follow [`SECURITY.md`](SECURITY.md) instead of
opening a public issue.

## Risk-Sensitive Changes

Because this project can route real trading orders, changes to the risk
engine (`artifacts/api-server/src/lib/risk/`), broker adapters, or the MT5
bridge should:

- Include or update tests where practical.
- Call out the risk implications explicitly in the PR description.
- Default to conservative behavior (e.g., fail closed, reject rather than
  silently proceed) when uncertain.
