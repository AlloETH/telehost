#!/bin/sh
set -e

SYNC_URL="${TELEHOST_SYNC_URL}"
AGENT_ID="${TELEHOST_AGENT_ID}"
SYNC_TOKEN="${TELEHOST_SYNC_TOKEN}"
DATA_DIR="/home/node/.openclaw"

# --- Restore archive from API on startup ---
restore_data() {
  if [ -z "$SYNC_URL" ] || [ -z "$AGENT_ID" ] || [ -z "$SYNC_TOKEN" ]; then
    echo "[sync] No sync credentials configured, skipping restore"
    return
  fi

  echo "[sync] Downloading data archive..."
  HTTP_CODE=$(curl -s -o /tmp/data.tar.gz -w "%{http_code}" \
    -H "x-sync-token: ${SYNC_TOKEN}" \
    "${SYNC_URL}/api/agents/${AGENT_ID}/workspace-sync")

  if [ "$HTTP_CODE" = "200" ] && [ -s /tmp/data.tar.gz ]; then
    echo "[sync] Extracting data archive to ${DATA_DIR}..."
    tar xzf /tmp/data.tar.gz -C / 2>/dev/null || echo "[sync] Warning: archive extraction had errors"
    rm -f /tmp/data.tar.gz
    echo "[sync] Data restored successfully"
  else
    echo "[sync] No archive found (HTTP ${HTTP_CODE}), starting fresh"
    rm -f /tmp/data.tar.gz
  fi
}

# --- Upload archive to API ---
upload_data() {
  if [ -z "$SYNC_URL" ] || [ -z "$AGENT_ID" ] || [ -z "$SYNC_TOKEN" ]; then
    echo "[sync] No sync credentials configured, skipping upload"
    return
  fi

  echo "[sync] Creating data archive..."
  tar czf /tmp/data-upload.tar.gz -C / home/node/.openclaw 2>/dev/null || {
    echo "[sync] Warning: tar had errors, attempting upload anyway"
  }

  if [ -s /tmp/data-upload.tar.gz ]; then
    SIZE=$(wc -c < /tmp/data-upload.tar.gz | tr -d ' ')
    echo "[sync] Uploading data archive (${SIZE} bytes)..."
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST \
      -H "x-sync-token: ${SYNC_TOKEN}" \
      -H "Content-Type: application/gzip" \
      --data-binary @/tmp/data-upload.tar.gz \
      "${SYNC_URL}/api/agents/${AGENT_ID}/workspace-sync")
    echo "[sync] Upload complete (HTTP ${HTTP_CODE})"
    rm -f /tmp/data-upload.tar.gz
  else
    echo "[sync] No data to upload"
  fi
}

# --- Signal handler ---
shutdown() {
  echo "[sync] Received shutdown signal, syncing data..."
  if [ -n "$SYNC_PID" ]; then
    kill "$SYNC_PID" 2>/dev/null || true
  fi
  if [ -n "$GATEWAY_PID" ]; then
    kill -TERM "$GATEWAY_PID" 2>/dev/null || true
    wait "$GATEWAY_PID" 2>/dev/null || true
  fi
  upload_data
  exit 0
}

trap shutdown TERM INT

# --- Periodic background sync (every 5 minutes) ---
periodic_sync() {
  while true; do
    sleep 300
    echo "[sync] Periodic sync triggered"
    upload_data
  done
}

# 1. Restore persisted data
restore_data

# 2. Decode OpenClaw config from env var (overrides persisted config with latest from dashboard)
if [ -n "$OPENCLAW_CONFIG_B64" ]; then
  echo "$OPENCLAW_CONFIG_B64" | base64 -d > "${DATA_DIR}/openclaw.json"
fi

mkdir -p "${DATA_DIR}/workspace"

# 3. Start periodic sync in background
periodic_sync &
SYNC_PID=$!

# 4. Start OpenClaw gateway in background so we can trap signals
# Force LAN bind so Coolify reverse proxy can reach the gateway
export OPENCLAW_GATEWAY_BIND=lan
node dist/index.js gateway &
GATEWAY_PID=$!

# Wait for gateway to exit
wait "$GATEWAY_PID"
EXIT_CODE=$?

# Gateway exited on its own — stop periodic sync and upload before container dies
if [ -n "$SYNC_PID" ]; then
  kill "$SYNC_PID" 2>/dev/null || true
fi
upload_data

exit $EXIT_CODE
