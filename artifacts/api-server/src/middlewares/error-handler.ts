import type { ErrorRequestHandler, RequestHandler } from "express";
import { logger } from "../lib/logger.js";

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  expose?: boolean;
}

/** 404 handler for unknown API routes. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
};

/**
 * Terminal error handler. Without this, an async route rejection surfaces as
 * Express' default HTML stack trace, leaking internals to the caller.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const error = err as HttpError;
  const status = error.status ?? error.statusCode ?? 500;
  const isClientError = status >= 400 && status < 500;

  logger.error(
    { err: error, path: req.originalUrl, method: req.method, status },
    "Unhandled request error",
  );

  if (res.headersSent) {
    res.end();
    return;
  }

  res.status(status).json({
    error: isClientError ? error.message || "Bad Request" : "Internal Server Error",
    ...(process.env["NODE_ENV"] === "production" || isClientError
      ? {}
      : { detail: error.message, stack: error.stack }),
  });
};

/** Wraps an async handler so rejections reach the error handler. */
export function asyncHandler<T extends RequestHandler>(handler: T): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}
