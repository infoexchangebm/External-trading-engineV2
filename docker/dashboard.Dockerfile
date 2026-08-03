# ---------------------------------------------------------------------------
# React dashboard (Vite build served by nginx)
# ---------------------------------------------------------------------------
FROM node:20-slim AS builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NODE_ENV=production \
    # vite.config.ts requires both of these to be present at build time
    PORT=24212 \
    BASE_PATH=/

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY lib ./lib
COPY artifacts/trading-engine ./artifacts/trading-engine
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile --ignore-scripts \
 && pnpm --filter @workspace/trading-engine run build

# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/artifacts/trading-engine/dist/public /usr/share/nginx/html

EXPOSE 24212

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:24212/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
