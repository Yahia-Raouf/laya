#!/bin/sh
set -e

# Sync the database schema. Early-stage: `db push` creates tables directly from
# schema.prisma (no migration files yet). Switch to `prisma migrate deploy`
# once we start committing migrations.
echo "[entrypoint] applying database schema (prisma db push)..."
npx prisma db push --skip-generate

echo "[entrypoint] starting laya-service..."
exec node dist/index.js
