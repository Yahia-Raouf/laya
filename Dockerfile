# syntax=docker/dockerfile:1

# ---- web builder: build the React + Vite portal to static assets ----
FROM node:20-bookworm AS webbuilder
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- builder: full Debian image so native prebuilds resolve cleanly ----
FROM node:20-bookworm AS builder
WORKDIR /app

# build-essential/python are only needed if a native dep has no prebuilt binary;
# cheap insurance in a stage that gets thrown away.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# drop dev deps for the runtime copy (prisma + client stay: they are deps)
RUN npm prune --omit=dev

# ---- runtime: slim Debian (glibc, NOT Alpine) ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    LAYA_CACHE=/data/laya

# openssl for the Prisma query engine; ca-certificates for the HF model download
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# non-root user; create + chown the model cache dir BEFORE declaring the volume
# so the fresh named volume is seeded with the right ownership
RUN useradd --create-home --uid 10001 appuser \
 && mkdir -p /data/laya \
 && chown -R appuser:appuser /data

WORKDIR /app
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/dist ./dist
COPY --from=builder --chown=appuser:appuser /app/prisma ./prisma
COPY --chown=appuser:appuser package.json ./
COPY --chown=appuser:appuser docker-entrypoint.sh ./
COPY --from=webbuilder --chown=appuser:appuser /web/dist ./web/dist

USER appuser
VOLUME ["/data/laya"]
EXPOSE 8080

# entrypoint applies the DB schema, then execs node (PID 1 -> receives SIGTERM)
CMD ["sh", "docker-entrypoint.sh"]
