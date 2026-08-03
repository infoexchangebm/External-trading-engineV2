# ---------------------------------------------------------------------------
# Express API server (TypeScript, bundled with esbuild)
# The root Dockerfile builds the Python engine; compose previously pointed the
# Node services at it, so neither container ever ran the real server.
# ---------------------------------------------------------------------------
FROM node:20-slim AS builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY lib ./lib
COPY artifacts/api-server ./artifacts/api-server
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile --ignore-scripts \
 && pnpm --filter @workspace/api-server run build \
 && pnpm deploy --filter @workspace/api-server --prod --legacy /out

# ---------------------------------------------------------------------------
FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder --chown=node:node /out ./
COPY --from=builder --chown=node:node /repo/artifacts/api-server/dist ./dist

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/healthz" || exit 1

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
