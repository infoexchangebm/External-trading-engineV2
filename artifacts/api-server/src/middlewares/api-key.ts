import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "../lib/logger.js";

/**
 * API key authentication for every mutating / data-exposing route.
 *
 * Health endpoints stay public so orchestrators can probe the container.
 * The key is compared in constant time to avoid leaking it byte-by-byte.
 */

// Paths are matched both mount-relative (router mounted at /api) and absolute.
const PUBLIC_PATHS = new Set([
  "/healthz",
  "/api/healthz",
  "/mt5/heartbeat",
  "/api/mt5/heartbeat",
]);

function isPublic(req: Request): boolean {
  return PUBLIC_PATHS.has(req.path) || PUBLIC_PATHS.has(req.originalUrl.split("?")[0] ?? "");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function extractKey(req: Request): string {
  const header = req.header("x-api-key");
  if (header) return header;
  const auth = req.header("authorization") ?? "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

export function apiKeyAuth(): RequestHandler {
  const expected = process.env["API_KEY"] ?? "";
  const allowInsecure = (process.env["ALLOW_INSECURE"] ?? "").toLowerCase() === "true";

  if (!expected) {
    if (process.env["NODE_ENV"] === "production" && !allowInsecure) {
      throw new Error(
        "API_KEY is required when NODE_ENV=production. Set ALLOW_INSECURE=true to override (not recommended).",
      );
    }
    logger.warn("API_KEY is not set - API authentication is disabled (development only)");
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!expected || req.method === "OPTIONS" || isPublic(req)) {
      next();
      return;
    }

    const provided = extractKey(req);
    if (!provided || !safeEqual(provided, expected)) {
      logger.warn({ path: req.path, ip: req.ip }, "Rejected request with invalid API key");
      res.status(401).json({ error: "Unauthorized", message: "Missing or invalid API key" });
      return;
    }

    next();
  };
}
