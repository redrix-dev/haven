#!/usr/bin/env bash
# Runs ON the dev backend host (flex). devdb.mjs copies this file there and
# calls it over ssh with plain-word arguments, so nothing here is ever quoted
# through two shells. See docs/DEV_BACKEND.md.
set -euo pipefail

ROOT="$HOME/haven-devdb"
CLI_DIR="$HOME/.local/share/supabase"
SUPABASE="$CLI_DIR/supabase"
NETWORK="haven-devdb"
FORWARDER="haven-devdb-forward"
SECRETS="$ROOT/functions.env"
DB_CONTAINER="supabase_db_haven"

die() {
  echo "[devdb:host] $*" >&2
  exit 1
}

# Installs the Supabase CLI as a single binary. No node, no sudo.
ensure_cli() {
  local want="$1"
  # The CLI is two files that must sit together: `supabase` (a shim) and
  # `supabase-go`. The shim alone answers --version, so check for both.
  if [ -x "$SUPABASE" ] && [ -x "$CLI_DIR/supabase-go" ] &&
    [ "$("$SUPABASE" --version 2>/dev/null)" = "$want" ]; then
    return
  fi
  echo "[devdb:host] installing supabase CLI $want"
  rm -rf "$CLI_DIR"
  mkdir -p "$CLI_DIR"
  curl -fsSL "https://github.com/supabase/cli/releases/download/v${want}/supabase_${want}_linux_amd64.tar.gz" |
    tar -xzf - -C "$CLI_DIR"
  [ -x "$CLI_DIR/supabase-go" ] || die "supabase-go missing after install"
}

# Secrets for edge functions live only on the host, outside the synced tree.
ensure_secrets() {
  mkdir -p "$ROOT/supabase/functions"
  if [ ! -f "$SECRETS" ]; then
    umask 077
    {
      echo "# Edge function secrets for the dev backend. Never production values."
      echo "HAVEN_WORKER_CRON_SECRET=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
      echo "# Voice: fill in the three lines below AND remove the leading \"# \"."
      echo "# LIVEKIT_URL=wss://<dev-project>.livekit.cloud"
      echo "# LIVEKIT_API_KEY="
      echo "# LIVEKIT_API_SECRET="
    } >"$SECRETS"
    echo "[devdb:host] created $SECRETS (add the LiveKit dev project keys there for voice)"
  fi
  cp "$SECRETS" "$ROOT/supabase/functions/.env"
}

tailnet_ip() {
  local ip
  ip="$(tailscale ip -4 2>/dev/null | head -n1)"
  [ -n "$ip" ] || die "no Tailscale IPv4 address; is tailscaled up?"
  echo "$ip"
}

# Published ports bind to loopback only. Docker's default is every address on
# the machine, and published ports skip the host firewall.
#
# Binding straight to the tailnet address was tried first and does not work:
# the CLI itself connects to 127.0.0.1:54322 during `start` and `db reset`.
ensure_network() {
  local have
  have="$(docker network inspect "$NETWORK" \
    --format '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}' 2>/dev/null || true)"
  if [ "$have" = "127.0.0.1" ]; then
    return
  fi
  if [ -n "$have" ]; then
    docker network rm "$NETWORK" >/dev/null ||
      die "docker network $NETWORK is bound to $have and is in use. Run devdb down, then devdb up."
  fi
  docker network create \
    -o "com.docker.network.bridge.host_binding_ipv4=127.0.0.1" "$NETWORK" >/dev/null
  echo "[devdb:host] created docker network $NETWORK bound to 127.0.0.1"
}

# The tailnet's way in: a small container on the host network that listens on
# the tailnet address and hands connections to loopback. API, Studio and mail
# only. Postgres (54322) stays unreachable from other machines on purpose.
# If Tailscale is not up yet at boot, the bind fails and Docker retries.
ensure_forwarder() {
  local ip
  ip="$(tailnet_ip)"
  if [ "$(docker inspect "$FORWARDER" --format '{{.State.Running}} {{index .Config.Labels "devdb.ip"}}' 2>/dev/null)" = "true $ip" ]; then
    return
  fi
  docker rm -f "$FORWARDER" >/dev/null 2>&1 || true
  docker run -d --name "$FORWARDER" --network host --restart unless-stopped \
    --label "devdb.ip=$ip" --entrypoint sh alpine/socat:1.8.0.3 -c "
      for port in 54321 54323 54324; do
        socat TCP-LISTEN:\$port,bind=$ip,fork,reuseaddr TCP:127.0.0.1:\$port &
      done
      wait -n" >/dev/null
  echo "[devdb:host] forwarding $ip:54321,54323,54324 -> 127.0.0.1"
}

cmd="${1:-}"
shift || true

case "$cmd" in
  prepare)
    ensure_cli "${1:?cli version}"
    docker info >/dev/null 2>&1 ||
      die "cannot talk to Docker. On the host run: sudo usermod -aG docker \$USER  (then log out and back in)"
    ensure_secrets
    ;;
  sync)
    # stdin: a tar of the supabase/ directory from the caller's working tree.
    mkdir -p "$ROOT/supabase"
    cd "$ROOT"
    # Delete files but keep directories: the edge runtime bind-mounts
    # supabase/functions, and replacing the directory would orphan the mount.
    find supabase -type f -not -path 'supabase/.temp/*' -delete
    # Containers own some bind-mounted directories; leave their metadata alone.
    tar -xf - --touch --no-overwrite-dir
    find supabase -mindepth 1 -type d -empty -not -path 'supabase/.temp*' -delete
    ensure_secrets
    echo "[devdb:host] synced $(find supabase/migrations -name '*.sql' | wc -l) migrations"
    ;;
  up)
    ensure_network
    cd "$ROOT"
    "$SUPABASE" start --network-id "$NETWORK"
    ensure_forwarder
    ;;
  down)
    docker rm -f "$FORWARDER" >/dev/null 2>&1 || true
    cd "$ROOT"
    "$SUPABASE" stop
    ;;
  reset)
    cd "$ROOT"
    # Without the flag the CLI recreates the database on its default network:
    # the other services lose it, and 54322 gets published on every address.
    "$SUPABASE" db reset --local --network-id "$NETWORK"
    ;;
  env)
    cd "$ROOT"
    "$SUPABASE" status -o env
    ;;
  ip)
    tailnet_ip
    ;;
  ports)
    docker ps --filter "name=_haven" --format '{{.Names}}\t{{.Ports}}'
    ;;
  psql)
    # stdin: SQL. The cron secret is handed to psql as a variable so seed
    # files never contain it.
    secret="$(grep -m1 '^HAVEN_WORKER_CRON_SECRET=' "$SECRETS" | cut -d= -f2-)"
    docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres \
      -v ON_ERROR_STOP=1 -v "haven_cron_secret=$secret" -q -f -
    ;;
  *)
    die "unknown command: $cmd"
    ;;
esac
