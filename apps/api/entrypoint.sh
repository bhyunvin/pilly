#!/bin/sh
set -e

# Render 512MB RAM 환경 대응 저메모리 Iggy 설정
export IGGY_SYSTEM_PATH="${IGGY_SYSTEM_PATH:-/tmp/iggy_data}"
export IGGY_SYSTEM_CACHE_SIZE="${IGGY_SYSTEM_CACHE_SIZE:-64MB}"
export IGGY_TCP_ENABLED="${IGGY_TCP_ENABLED:-true}"
export IGGY_TCP_ADDRESS="${IGGY_TCP_ADDRESS:-127.0.0.1:8090}"
export IGGY_HTTP_ENABLED="${IGGY_HTTP_ENABLED:-false}"
export IGGY_HTTP_ADDRESS="${IGGY_HTTP_ADDRESS:-127.0.0.1:8080}"
export IGGY_QUIC_ENABLED="${IGGY_QUIC_ENABLED:-false}"

if command -v iggy-server >/dev/null 2>&1; then
  echo "[entrypoint] Starting iggy-server (low-memory mode: cache=${IGGY_SYSTEM_CACHE_SIZE})..."
  iggy-server &

  # Iggy TCP 포트(127.0.0.1:8090) 오픈 대기 (최대 15초)
  i=0
  while [ "$i" -lt 15 ]; do
    if (echo >/dev/tcp/127.0.0.1/8090) 2>/dev/null; then
      echo "[entrypoint] iggy-server is ready on 127.0.0.1:8090"
      break
    fi
    i=$((i + 1))
    sleep 1
  done
else
  echo "[entrypoint] iggy-server not found; pilly-api will run in DB fallback mode."
fi

echo "[entrypoint] Starting pilly-api..."
exec pilly-api
