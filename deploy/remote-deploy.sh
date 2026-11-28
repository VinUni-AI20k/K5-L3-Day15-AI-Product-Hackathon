#!/usr/bin/env bash
# Runs ON THE VPS, piped into `ssh ... 'bash -s'` by .github/workflows/deploy.yml.
#
# Required environment variables (passed via stdin exports, never argv):
#   VPS_APP_DIR   target directory on VPS (default /srv/vpost)
#   IMAGE_PREFIX  ghcr.io/<owner>/<repo> (lowercased)
#   IMAGE_TAG     git SHA to deploy
#   GHCR_USER     GitHub actor for registry login
#   GHCR_TOKEN    GitHub token for registry login
set -euo pipefail

VPS_APP_DIR="${VPS_APP_DIR:-/srv/vpost}"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
WEB_PROBE_URL="http://127.0.0.1:3110/api/health"

for var in VPS_APP_DIR IMAGE_PREFIX IMAGE_TAG GHCR_USER GHCR_TOKEN; do
  if [ -z "${!var:-}" ]; then
    echo "remote-deploy: $var is not set" >&2
    exit 1
  fi
done

cd "$VPS_APP_DIR"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "remote-deploy: $VPS_APP_DIR/$COMPOSE_FILE is missing" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "remote-deploy: $VPS_APP_DIR/.env is missing — copy deploy/env/prod.env.example to $VPS_APP_DIR/.env and fill in required values" >&2
  exit 1
fi

if ! docker network inspect vpost-edge >/dev/null 2>&1; then
  echo "remote-deploy: external Docker network 'vpost-edge' does not exist — run 'docker network create vpost-edge' and attach your edge Caddy container" >&2
  exit 1
fi

compose() {
  docker compose \
    --env-file .env \
    --env-file .image-tag.env \
    -f "$COMPOSE_FILE" \
    "$@"
}

cleanup() {
  # Never leave GHCR credentials persisted in ~/.docker/config.json.
  docker logout ghcr.io >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "--- preflight: required env vars derived from $COMPOSE_FILE"
required="$(
  grep -ohE '\$\{[A-Z_][A-Z0-9_]*:\?' "$COMPOSE_FILE" \
    | sed 's/^\${//; s/:?$//' \
    | sort -u
)"

resolve_env_var() {
  local key="$1"
  local val=""
  local file line

  for file in .env .image-tag.env; do
    [ -f "$file" ] || continue
    line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true)"
    if [ -n "$line" ]; then
      val="${line#*=}"
      val="${val%$'\r'}"
      # Strip matching surrounding single or double quotes.
      if [[ "$val" == \"*\" && "$val" == *\" && ${#val} -ge 2 ]]; then
        val="${val:1:${#val}-2}"
      elif [[ "$val" == \'*\' && "$val" == *\' && ${#val} -ge 2 ]]; then
        val="${val:1:${#val}-2}"
      fi
    fi
  done

  # Exported shell env wins over files, matching docker compose precedence.
  if [ -n "${!key:-}" ]; then
    val="${!key}"
  fi
  printf '%s' "$val"
}

missing=()
for var in $required; do
  if [ -z "$(resolve_env_var "$var")" ]; then
    missing+=("$var")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "remote-deploy: $VPS_APP_DIR/.env is missing required values:" >&2
  for var in "${missing[@]}"; do
    echo "  - $var" >&2
  done
  echo "  See deploy/env/prod.env.example in the repository for the full template." >&2
  exit 1
fi
echo "  all $(printf '%s\n' "$required" | wc -w | tr -d ' ') required variables resolve"

echo "--- pin release $IMAGE_TAG"
cat > .image-tag.env <<EOF
# Written by CI on every deploy. Do not edit by hand.
IMAGE_PREFIX=$IMAGE_PREFIX
IMAGE_TAG=$IMAGE_TAG
EOF

echo "--- docker login ghcr.io"
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin

echo "--- pull images"
compose --profile migrate pull --quiet

echo "--- start datastores (postgres, redis)"
compose up -d --wait postgres redis

echo "--- run database migrations"
# `< /dev/null` is load-bearing: this script is streamed over SSH stdin, so
# without redirecting stdin `docker compose run` would consume the rest of the script.
compose run --rm --no-deps migrate < /dev/null

echo "--- start application stack"
compose up -d --no-build --remove-orphans

echo "--- wait for service health"
wait_container_healthy() {
  local service="$1"
  local cid status=""
  cid="$(compose ps -q "$service")"
  if [ -z "$cid" ]; then
    echo "  $service: no container started" >&2
    return 1
  fi
  for _ in $(seq 1 60); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo gone)"
    case "$status" in
      healthy) echo "  $service: healthy"; return 0 ;;
      none)    echo "  $service: running (no healthcheck)"; return 0 ;;
      gone)    echo "  $service: container disappeared" >&2; return 1 ;;
    esac
    sleep 5
  done
  echo "  $service: still '$status' after 5 minutes" >&2
  return 1
}

wait_web_http_health() {
  local headers body http_code content_type
  headers="$(mktemp)"
  body="$(mktemp)"
  for _ in $(seq 1 60); do
    http_code="$(curl -sS --max-time 5 -D "$headers" -o "$body" -w '%{http_code}' "$WEB_PROBE_URL" 2>/dev/null || echo 000)"
    content_type="$(grep -i '^content-type:' "$headers" | tail -n 1 | tr -d '\r' || true)"
    if [ "$http_code" = "200" ] \
      && printf '%s' "$content_type" | grep -qi 'application/json' \
      && grep -q '"status"[[:space:]]*:[[:space:]]*"ok"' "$body"; then
      echo "  web HTTP health ok ($WEB_PROBE_URL -> $http_code, $content_type): $(cat "$body")"
      rm -f "$headers" "$body"
      return 0
    fi
    sleep 3
  done
  echo "  web HTTP health FAILED ($WEB_PROBE_URL -> status=$http_code, $content_type): $(head -c 300 "$body" 2>/dev/null || true)" >&2
  rm -f "$headers" "$body"
  return 1
}

failed=0
for service in api web worker; do
  if ! wait_container_healthy "$service"; then
    failed=1
  fi
done

if [ "$failed" -eq 0 ]; then
  if ! wait_web_http_health; then
    failed=1
  fi
fi

if [ "$failed" -ne 0 ]; then
  echo "--- deploy FAILED: container status and recent logs" >&2
  compose ps -a >&2 || true
  compose logs --tail 100 api web worker >&2 || true
  exit 1
fi

echo "--- docker logout ghcr.io"
docker logout ghcr.io >/dev/null 2>&1 || true

echo "--- reclaim unused images"
docker image prune -f >/dev/null || true
docker image prune -af --filter "until=168h" >/dev/null || true
df -h / | awk 'NR==2 {print "  root filesystem: " $4 " free (" $5 " used)"}'

echo "--- deployed $IMAGE_TAG"
compose ps
