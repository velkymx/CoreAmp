#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/target/packages/macos"
mkdir -p "${OUTPUT_DIR}"

if ! command -v cargo-tauri >/dev/null 2>&1 && ! cargo tauri --help >/dev/null 2>&1; then
  cargo install tauri-cli --locked
fi

export MACOSX_DEPLOYMENT_TARGET="10.13"

(cd "${ROOT_DIR}/coreamp-app" && cargo tauri build --target aarch64-apple-darwin --bundles app)

ARM_DIR="${ROOT_DIR}/target/aarch64-apple-darwin/release/bundle/macos"
ARM_APP="${ARM_DIR}/CoreAmp.app"

if [ ! -d "${ARM_APP}" ]; then
  echo "ARM app bundle not found at ${ARM_APP}" >&2
  exit 1
fi

cp -R "${ARM_APP}" "${OUTPUT_DIR}/CoreAmp.app"

ENTITLEMENTS="${ROOT_DIR}/packaging/macos/entitlements.plist"
SIGN_IDENTITY="${CODESIGN_IDENTITY:--}"

echo "Signing with identity: ${SIGN_IDENTITY}"
codesign --deep --force --options runtime \
  --entitlements "${ENTITLEMENTS}" \
  --sign "${SIGN_IDENTITY}" \
  "${OUTPUT_DIR}/CoreAmp.app"

echo "Verifying signature:"
codesign --verify --verbose=2 "${OUTPUT_DIR}/CoreAmp.app"

rm -f "${OUTPUT_DIR}/CoreAmp.app.zip"
(cd "${OUTPUT_DIR}" && zip -r -y "CoreAmp.app.zip" CoreAmp.app)

echo "macOS ARM bundle written to ${OUTPUT_DIR}"