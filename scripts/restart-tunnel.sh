#!/usr/bin/env bash
# MintGuard public tunnel — re-establish the public HTTPS endpoint for the
# Node server on :8787. Tries Cloudflare quick tunnel first, then
# localtunnel. Writes the live URL to ENDPOINT_URL.txt in the repo root.
#
# HONEST STATUS (2026-11-15, tested on the build VM): BOTH tunnel services
# are blocked by this VM's egress proxy — cloudflared fails with
# "tls: first record does not look like a TLS handshake" when POSTing to
# api.trycloudflare.com, localtunnel's child process dies silently, and
# outbound SSH (localhost.run / serveo) is reset. On a machine with direct
# internet this script should work as-is. The script reports clearly when
# neither option works instead of printing a fake URL.
#
# Behaviour across a restart: a tunnel URL is tied to its process. If the
# host restarts, the tunnel dies and a new one gets a DIFFERENT URL. That is
# why every successful URL is logged with a timestamp in
# ENDPOINT_URL_HISTORY.txt. The static demo (docs/index.html) keeps working
# with no server at all, so reviewers always have something to try.
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
PORT="${PORT:-8787}"
CLOUDFLARED="${CLOUDFLARED:-$HOME/.local/bin/cloudflared}"

# 1) Make sure the server is up.
if ! curl -sf "http://localhost:${PORT}/health" >/dev/null 2>&1; then
  echo "starting MintGuard server on :${PORT} ..."
  nohup node server.mjs >> /tmp/mintguard-server.log 2>&1 &
  for _ in $(seq 1 15); do curl -sf "http://localhost:${PORT}/health" >/dev/null 2>&1 && break; sleep 1; done
fi

# 2) If a recorded tunnel URL is still healthy, keep it (don't rotate it).
CURRENT="$(cat "$REPO/ENDPOINT_URL.txt" 2>/dev/null || true)"
if [ -n "$CURRENT" ] && curl -sf --max-time 10 "$CURRENT/health" >/dev/null 2>&1; then
  echo "tunnel already up: $CURRENT"
  exit 0
fi

try_cloudflared() {
  rm -f /tmp/mintguard-tunnel.log
  nohup "$CLOUDFLARED" tunnel --url "http://localhost:${PORT}" > /tmp/mintguard-tunnel.log 2>&1 &
  local pid=$!
  local url=""
  for _ in $(seq 1 45); do
    url="$(grep -aoE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/mintguard-tunnel.log | grep -av 'api\.trycloudflare\.com' | head -n 1)"
    [ -n "$url" ] && break
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  if [ -n "$url" ] && curl -sf --max-time 15 "$url/health" >/dev/null 2>&1; then
    echo "$url"
    return 0
  fi
  kill "$pid" 2>/dev/null || true
  return 1
}

try_localtunnel() {
  rm -f /tmp/mintguard-lt.log
  nohup npx -y localtunnel --port "$PORT" > /tmp/mintguard-lt.log 2>&1 &
  local pid=$!
  local url=""
  for _ in $(seq 1 90); do
    url="$(grep -aoE 'https://[a-z0-9.-]+\.loca\.lt' /tmp/mintguard-lt.log | head -n 1)"
    [ -n "$url" ] && break
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  if [ -n "$url" ] && curl -sf --max-time 15 "$url/health" >/dev/null 2>&1; then
    echo "$url"
    return 0
  fi
  kill "$pid" 2>/dev/null || true
  return 1
}

URL="$(try_cloudflared || true)"
[ -z "$URL" ] && URL="$(try_localtunnel || true)"
if [ -z "$URL" ]; then
  echo "ERROR: no public tunnel could be established on this machine."
  echo "  cloudflared log: /tmp/mintguard-tunnel.log"
  echo "  localtunnel log: /tmp/mintguard-lt.log"
  echo "  The server is still running locally on http://localhost:${PORT}/"
  echo "  and the static demo (docs/index.html) works from any static host."
  exit 1
fi
echo "$URL" > "$REPO/ENDPOINT_URL.txt"
echo "$(date -u +%FT%TZ) $URL" >> "$REPO/ENDPOINT_URL_HISTORY.txt"
echo "public endpoint: $URL"
