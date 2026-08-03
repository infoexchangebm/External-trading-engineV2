import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { apiKeyAuth } from "./middlewares/api-key.js";
import { rateLimit } from "./middlewares/rate-limit.js";
import { corsOptions, securityHeaders } from "./middlewares/security.js";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler.js";

const app: Express = express();

// Correct client IPs behind Caddy/Nginx so rate limiting is not keyed on the proxy.
app.set("trust proxy", process.env["TRUST_PROXY"] ?? 1);
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    // Never log credentials or webhook secrets.
    redact: {
      paths: [
        "req.headers.authorization",
        'req.headers["x-api-key"]',
        "req.headers.cookie",
        "res.headers['set-cookie']",
      ],
      remove: true,
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(securityHeaders());
app.use(cors(corsOptions()));
// Cap payload size: TradingView alerts are tiny, anything larger is abuse.
app.use(express.json({ limit: process.env["JSON_BODY_LIMIT"] ?? "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

app.use(
  "/api",
  rateLimit({ skip: (req) => req.path === "/healthz" || req.path === "/mt5/heartbeat" }),
  apiKeyAuth(),
  router,
);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
