ARG NODE_IMAGE=node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm check:content-release
RUN pnpm build
# Next bundles the app DB client; standalone tracing does not retain the raw CLI dependency.
RUN node -e "const fs = require('node:fs'); fs.cpSync(fs.realpathSync('node_modules/postgres'), '.next/standalone/node_modules/postgres', { recursive: true, dereference: true })"

FROM ${NODE_IMAGE} AS runtime-base
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Package managers are build tools; the runtime uses node and packaged CLIs only.
# The zlib minimum includes Alpine's CVE-2026-85091 fix.
RUN apk add --no-cache ffmpeg 'zlib>=1.3.2-r1' \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

FROM runtime-base AS runner
COPY --from=builder --chown=nextjs:nodejs /app/THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts/start-production.mjs /app/scripts/migrate-db.mjs /app/scripts/cleanup-db.mjs /app/scripts/check-production-config.mjs ./scripts/
COPY --from=builder --chown=nextjs:nodejs /app/scripts/grant-runtime-db.mjs /app/scripts/database-runtime-grants.mjs ./scripts/
COPY --from=builder --chown=nextjs:nodejs /app/scripts/database-backup.mjs ./scripts/
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/production-config.mjs /app/src/lib/database-schema.mjs ./src/lib/
RUN mkdir -p /app/.data /app/.next/cache && chown -R nextjs:nodejs /app/.data /app/.next/cache
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:${PORT:-3000}/api/health || exit 1
CMD ["node", "scripts/start-production.mjs", "--standalone"]
