#!/bin/sh
set -e

echo "[entrypoint] applying database migrations..."
node --import tsx ./src/lib/db/migrate.ts

echo "[entrypoint] starting web server..."
exec node server.js
