## Summary

<!-- What does this PR change, and why? -->

## Affected Component(s)

- [ ] Express API server (`artifacts/api-server`)
- [ ] Python signal service (`app/`, `run.py`, `config/`)
- [ ] React dashboard (`artifacts/trading-engine`)
- [ ] Mobile app (`artifacts/signal-mobile`)
- [ ] Broker adapter / MT5 bridge
- [ ] Risk engine
- [ ] Database / Drizzle schema (`lib/db`)
- [ ] API contract (`lib/api-spec/openapi.yaml`)
- [ ] Docker / deployment / CI
- [ ] Documentation

## Changes

<!-- Bullet list of the key changes in this PR. -->

-

## Risk-Sensitive Change?

If this PR touches the risk engine, broker adapters, the MT5 bridge, or
signal generation, describe the risk implications and any safeguards added
or preserved. If not applicable, write "N/A".

<!-- e.g. "Adds a new exposure cap; defaults preserve existing behavior." -->

## How Was This Tested?

- [ ] `pytest` passes
- [ ] `ruff check .` passes
- [ ] `pnpm typecheck` passes
- [ ] Manually tested against a running instance (describe below)

<!-- Describe manual testing, e.g. requests made, environment used (paper broker, local Docker Compose, etc.) -->

## Related Issues

<!-- Closes #123 -->

## Documentation

- [ ] Updated `CHANGELOG.md` under `[Unreleased]`
- [ ] Updated `README.md` and/or `docs/*.md` if behavior, config, or endpoints changed
- [ ] No documentation changes needed

## Checklist

- [ ] I have read [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- [ ] I have not committed secrets, `.env` files, or real broker credentials
- [ ] My changes generate no new lint or typecheck warnings
