# External Trading Engine - developer shortcuts
# Run `make help` for the full list.

PYTHON ?= python3
VENV   ?= .venv
BIN     = $(VENV)/bin
PNPM   ?= pnpm

.DEFAULT_GOAL := help
.PHONY: help setup dev test test-cov lint fmt typecheck ui-install ui-typecheck ui-dev docker-build docker-up docker-down docker-logs clean check

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

setup: ## Create the Python venv, install dev deps and seed .env
	$(PYTHON) -m venv $(VENV)
	$(BIN)/pip install --upgrade pip
	$(BIN)/pip install -r requirements-dev.txt
	@test -f .env || (cp .env.example .env && echo "Created .env - add your API keys")
	@mkdir -p logs

dev: ## Run the Python signal engine with autoreload
	$(BIN)/python run.py --reload

test: ## Run the Python test suite
	$(BIN)/pytest

test-cov: ## Run tests with a coverage report
	$(BIN)/pytest --cov=app --cov=config --cov-report=term-missing

lint: ## Lint Python sources
	$(BIN)/ruff check .

fmt: ## Auto-format and auto-fix Python sources
	$(BIN)/ruff check . --fix
	$(BIN)/ruff format app config tests run.py

typecheck: ## Type check Python sources
	$(BIN)/mypy app config run.py

ui-install: ## Install workspace JavaScript dependencies
	$(PNPM) install

ui-typecheck: ## Type check every TypeScript package
	$(PNPM) run typecheck

ui-dev: ## Run the dashboard in dev mode
	PORT=24212 BASE_PATH=/ $(PNPM) --filter @workspace/trading-engine run dev

check: lint test ui-typecheck ## Everything CI runs

docker-build: ## Build all container images
	docker compose build

docker-up: ## Start the full stack in the background
	docker compose up -d

docker-down: ## Stop the stack and remove containers
	docker compose down

docker-logs: ## Tail logs from every service
	docker compose logs -f --tail=100

clean: ## Remove caches and build output
	rm -rf .pytest_cache .ruff_cache .mypy_cache htmlcov .coverage
	find . -type d -name __pycache__ -not -path "./node_modules/*" -exec rm -rf {} +
