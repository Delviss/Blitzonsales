#!/bin/sh
# Runs migrations and (idempotent) demo seed before starting the API.
set -e
cd /app/apps/api
npm run migration:run
npm run seed
exec node dist/src/main.js
