# Multi-stage build for the Next.js (standalone) web app.
# Build context is the REPOSITORY ROOT so that ./rules can be copied in.

# ---- deps: install node_modules ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY web/package.json web/package-lock.json ./
# --ignore-scripts avoids optional native postinstall steps; none are required.
RUN npm ci --ignore-scripts

# ---- builder: compile the standalone server ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy build-time env so config parsing in any statically-analysed path does
# not fail the build. Real values are supplied at runtime by compose.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    SESSION_SECRET=build-only-session-secret-build-only-xxxx \
    HASH_PEPPER=build-only-hash-pepper-build-only-xxxxxxxx \
    APP_BASE_URL=http://localhost:3000
RUN npm run build

# ---- runner: minimal runtime image ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Standalone server + static assets.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Migrations and the tooling to apply them at startup.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json

# Shared rule data (read by the TS engine). Copied from the repo root context.
COPY rules/ ./rules/

COPY web/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
