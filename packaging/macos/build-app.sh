#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/target/packages/macos"
mkdir -p "${OUTPUT_DIR}"

if ! command -v cargo-tauri >/dev/null 2>&1 && ! cargo tauri --help >/dev/null 2>&1; then
  cargo install tauri-cli --locked
fi

(cd "${ROOT_DIR}/coreamp-app" && cargo tauri build --bundles app)

APP_DIR="${ROOT_DIR}/target/release/bundle/macos"
if [ ! -d "${APP_DIR}" ]; then
  APP_DIR="${ROOT_DIR}/coreamp-app/target/release/bundle/macos"
fi

APP_BUNDLE="${APP_DIR}/CoreAmp.app"
if [ ! -d "${APP_BUNDLE}" ]; then
  echo "Expected app bundle not found at ${APP_BUNDLE}" >&2
  exit 1
fi

tar -C "${APP_DIR}" -czf "${OUTPUT_DIR}/CoreAmp.app.tar.gz" CoreAmp.app

echo "macOS bundle artifacts written to ${OUTPUT_DIR}"
