#!/usr/bin/env python3
"""Entrypoint for the Python signal engine.

Usage:
    python run.py                # honours HOST/PORT/LOG_LEVEL from .env
    python run.py --reload       # development mode with autoreload
"""

from __future__ import annotations

import argparse
import sys

import uvicorn

from config.config import settings


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the External Trading Engine API")
    parser.add_argument("--host", default=settings.host, help="Bind address")
    parser.add_argument("--port", type=int, default=settings.port, help="Bind port")
    parser.add_argument("--reload", action="store_true", help="Enable autoreload (development)")
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Worker processes (keep at 1: the scheduler must not be duplicated)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if args.workers > 1:
        print(
            "Refusing to start with more than one worker: the APScheduler loop would "
            "run once per worker and duplicate signals. Scale horizontally instead.",
            file=sys.stderr,
        )
        return 2

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level=settings.log_level.lower(),
        access_log=not settings.is_production,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
