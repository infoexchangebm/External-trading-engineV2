import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { CorsOptions } from "cors";

/**
 * Baseline security headers (helmet-equivalent subset, no extra dependency)
 * and a CORS allowlist. `cors()` with no arguments reflects any origin, which
 * lets any website drive the trading API from a victim's browser.
 */
export function securityHeaders(): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    if (process.env["NODE_ENV"] === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    res.removeHeader("X-Powered-By");
    next();
  };
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  const configured = (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length > 0) return configured;

  return [
    "http://localhost:5173",
    "http://localhost:24212",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:24212",
  ];
}

export function corsOptions(raw = process.env["CORS_ORIGINS"]): CorsOptions {
  const allowed = parseAllowedOrigins(raw);
  const allowAll = allowed.includes("*");

  return {
    origin(origin, callback) {
      // Same-origin / server-to-server requests carry no Origin header.
      if (!origin || allowAll || allowed.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-API-Key", "Authorization"],
    maxAge: 600,
  };
}
