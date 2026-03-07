#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/target/packages/linux"
mkdir -p "${OUTPUT_DIR}"

if ! command -v cargo-tauri >/dev/null 2>&1 && ! cargo tauri --help >/dev/null 2>&1; then
  cargo install tauri-cli --locked
fi

(
  cd "${ROOT_DIR}/coreamp-app"
  cargo tauri build --bundles appimage
)

BUNDLE_DIR="${ROOT_DIR}/target/release/bundle/appimage"
if [ ! -d "${BUNDLE_DIR}" ]; then
  BUNDLE_DIR="${ROOT_DIR}/coreamp-app/target/release/bundle/appimage"
fi

find "${BUNDLE_DIR}" -maxdepth 1 -type f -name '*.AppImage' -exec cp {} "${OUTPUT_DIR}/" \;

echo "AppImage artifacts written to ${OUTPUT_DIR}"
