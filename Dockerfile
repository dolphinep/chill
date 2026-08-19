# Stage 1: Dependencies & Build
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.10.0 --activate

WORKDIR /app

# Copy dependency manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/protocol/package.json ./packages/protocol/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/protocol ./packages/protocol
COPY apps/web ./apps/web
COPY scripts ./scripts
COPY tsconfig.json ./

# Build packages
RUN pnpm --filter @chill/protocol build
RUN pnpm --filter @chill/web build

# Stage 2: Production Unified Server Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

COPY --from=builder --chown=appuser:nodejs /app ./

USER appuser

EXPOSE 8080

CMD ["node", "./node_modules/tsx/dist/cli.mjs", "scripts/unified-server.ts"]
