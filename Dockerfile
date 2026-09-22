# syntax=docker/dockerfile:1

# ---- web builder: build the React + Vite portal to static assets ----
FROM node:20-bookworm AS webbuilder
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- deps: production node_modules + generated Prisma client ----
# Depends ONLY on package files + schema, never on src. This keeps the large
# node_modules layer stable across code-only changes, so the server pulls just
# the small dist layers on each deploy instead of re-downloading everything.
FROM node:20-bookworm AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

# ---- builder: compile TypeScript (needs dev deps). Only dist is taken. ----
FROM node:20-bookworm AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

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
RUN useradd --create-home --uid 10001 appuser \
 && mkdir -p /data/laya \
 && chown -R appuser:appuser /data

WORKDIR /app
# order matters for pull size: stable (deps) first, code-changing (dist) last
COPY --from=deps --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=deps --chown=appuser:appuser /app/prisma ./prisma
COPY --from=builder --chown=appuser:appuser /app/dist ./dist
COPY --chown=appuser:appuser package.json ./
COPY --chown=appuser:appuser docker-entrypoint.sh ./
COPY --from=webbuilder --chown=appuser:appuser /web/dist ./web/dist

USER appuser
VOLUME ["/data/laya"]
EXPOSE 8080

# entrypoint applies the DB schema, then execs node (PID 1 -> receives SIGTERM)
CMD ["sh", "docker-entrypoint.sh"]
