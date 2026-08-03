import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Dependency-free fixed-window rate limiter.
 *
 * A trading webhook is an attractive target for replay/flood attempts, and an
 * unbounded ingest path can also exhaust the database connection pool. Limits
 * are per client IP and configurable via RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  max?: number;
  windowMs?: number;
  skip?: (req: Request) => boolean;
}

export function rateLimit(options: RateLimitOptions = {}): RequestHandler {
  const max = options.max ?? Number(process.env["RATE_LIMIT_MAX"] ?? 120);
  const windowMs = options.windowMs ?? Number(process.env["RATE_LIMIT_WINDOW_MS"] ?? 60_000);
  const buckets = new Map<string, Bucket>();

  // Bounded memory: drop expired buckets on a slow interval.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  sweeper.unref?.();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (max <= 0 || options.skip?.(req)) {
      next();
      return;
    }

    const now = Date.now();
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("RateLimit-Limit", max);
      res.setHeader("RateLimit-Remaining", max - 1);
      next();
      return;
    }

    bucket.count += 1;
    const remaining = Math.max(max - bucket.count, 0);
    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", remaining);

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      res.status(429).json({ error: "Too Many Requests", retryAfterSeconds: retryAfter });
      return;
    }

    next();
  };
}
