#!/usr/bin/env bash
# Builds preview.openmarch.com from the repository root (see README.md).
set -euo pipefail
cd "$(dirname "$0")/../../.."
pnpm turbo run build --filter="@openmarch/desktop^..." --filter="@openmarch/website^..."
SITE_CHANNEL=preview pnpm --filter @openmarch/website run build
WEB_CHANNEL=preview WEB_BASE=/editor/ pnpm --filter @openmarch/desktop run web:build
node apps/website/preview/assemble.mjs
