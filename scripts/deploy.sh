#!/usr/bin/env bash
#
# Deploy one environment of Five Kingdoms to Cloudflare: the room server Worker, then the web
# client built against that server's URL.
#
#   scripts/deploy.sh <demo|dev|staging|production>
#
# Each environment deploys from its branch in the promotion chain:
#   demo → demo, dev → dev, staging → staging, production → main
# Set ALLOW_ANY_BRANCH=1 to skip that check (for example, a hotfix you have been asked to ship).
#
# Auth: either `wrangler login` once on this machine, or CLOUDFLARE_API_TOKEN and
# CLOUDFLARE_ACCOUNT_ID in the environment (or in the repo's gitignored `.env`).
# First time? Run scripts/deploy-wizard.sh instead; it walks through the account setup.

set -euo pipefail

usage() { echo "usage: $0 <demo|dev|staging|production>" >&2; exit 2; }
[[ $# -eq 1 ]] || usage

ENV_NAME="$1"
case "$ENV_NAME" in
  demo | dev | staging) BRANCH="$ENV_NAME" ;;
  production) BRANCH="main" ;;
  *) usage ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load CLOUDFLARE_* from .env if present, without overriding what is already exported.
if [[ -f .env ]]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^CLOUDFLARE_(API_TOKEN|ACCOUNT_ID)$ ]] || continue
    [[ -n "${!key:-}" ]] && continue
    value="${value#\'}"; value="${value%\'}"
    export "$key=$value"
  done < .env
fi

current="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current" != "$BRANCH" && "${ALLOW_ANY_BRANCH:-}" != "1" ]]; then
  echo "error: '$ENV_NAME' deploys from '$BRANCH', but you are on '$current'." >&2
  echo "       git checkout $BRANCH && git pull, or set ALLOW_ANY_BRANCH=1." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "warning: the working tree has uncommitted changes; they will be deployed too." >&2
fi

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Deploying the room server (env: $ENV_NAME)"
server_log="$(mktemp)"
trap 'rm -f "$server_log"' EXIT
(cd apps/server && pnpm exec wrangler deploy --env "$ENV_NAME") 2>&1 | tee "$server_log"

SERVER_URL="$(grep -oE 'https://[A-Za-z0-9.-]+\.workers\.dev' "$server_log" | head -n1 || true)"
if [[ -z "$SERVER_URL" ]]; then
  echo "error: could not find the server's workers.dev URL in wrangler's output." >&2
  echo "       Does the account have a workers.dev subdomain? See scripts/deploy-wizard.sh." >&2
  exit 1
fi

echo "==> Building the web client against $SERVER_URL"
rm -rf apps/client/dist
(cd apps/client && EXPO_PUBLIC_SERVER_URL="$SERVER_URL" pnpm exec expo export -p web)

echo "==> Deploying the web client (env: $ENV_NAME)"
web_log="$(mktemp)"
trap 'rm -f "$server_log" "$web_log"' EXIT
(cd apps/client && pnpm exec wrangler deploy --env "$ENV_NAME") 2>&1 | tee "$web_log"
WEB_URL="$(grep -oE 'https://[A-Za-z0-9.-]+\.workers\.dev' "$web_log" | head -n1 || true)"

echo
echo "Deployed '$ENV_NAME' from $(git rev-parse --short HEAD) on $current."
echo "  server: $SERVER_URL"
echo "  web:    ${WEB_URL:-(see wrangler output above)}"
