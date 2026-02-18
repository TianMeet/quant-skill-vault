#!/usr/bin/env bash
set -euo pipefail

# Ensure Prisma schema changes are reflected in repository migrations.
# Includes tracked and untracked files in working tree.

SCHEMA_CHANGED="$(git status --porcelain -- prisma/schema.prisma || true)"
MIGRATIONS_CHANGED="$(git status --porcelain -- prisma/migrations || true)"

if [[ -n "${SCHEMA_CHANGED}" && -z "${MIGRATIONS_CHANGED}" ]]; then
  echo "Prisma schema has changed, but no migration files were added/updated."
  echo "Run:"
  echo "  pnpm db:migrate:local:create -- <migration_name>"
  echo "  pnpm db:migrate:local:apply"
  echo "Then commit both prisma/schema.prisma and prisma/migrations/*."
  exit 1
fi

echo "Prisma migration check passed."
