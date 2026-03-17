#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/target/packages/macos"
mkdir -p "${OUTPUT_DIR}"

if ! command -v cargo-tauri >/dev/null 2>&1 && ! cargo tauri --help >/dev/null 2>&1; then
  cargo install tauri-cli --locked
fi

export MACOSX_DEPLOYMENT_TARGET="10.13"

# Build for both architectures
(cd "${ROOT_DIR}/coreamp-app" && cargo tauri build --target aarch64-apple-darwin --bundles app)
(cd "${ROOT_DIR}/coreamp-app" && cargo tauri build --target x86_64-apple-darwin --bundles app)

ARM_DIR="${ROOT_DIR}/target/aarch64-apple-darwin/release/bundle/macos"
X86_DIR="${ROOT_DIR}/target/x86_64-apple-darwin/release/bundle/macos"

ARM_APP="${ARM_DIR}/CoreAmp.app"
X86_APP="${X86_DIR}/CoreAmp.app"

if [ ! -d "${ARM_APP}" ]; then
  echo "ARM app bundle not found at ${ARM_APP}" >&2
  exit 1
fi
if [ ! -d "${X86_APP}" ]; then
  echo "x86 app bundle not found at ${X86_APP}" >&2
  exit 1
fi

# Create universal binary by merging with lipo
UNIVERSAL_APP="${OUTPUT_DIR}/CoreAmp.app"
rm -rf "${UNIVERSAL_APP}"
cp -R "${ARM_APP}" "${UNIVERSAL_APP}"

ARM_BIN="${ARM_APP}/Contents/MacOS/coreamp-app"
X86_BIN="${X86_APP}/Contents/MacOS/coreamp-app"
UNIVERSAL_BIN="${UNIVERSAL_APP}/Contents/MacOS/coreamp-app"

lipo -create "${ARM_BIN}" "${X86_BIN}" -output "${UNIVERSAL_BIN}"

echo "Universal binary architectures:"
lipo -info "${UNIVERSAL_BIN}"

rm -f "${OUTPUT_DIR}/CoreAmp.app.zip"
(cd "${OUTPUT_DIR}" && zip -r -y "CoreAmp.app.zip" CoreAmp.app)
rm -rf "${UNIVERSAL_APP}"

echo "macOS universal bundle written to ${OUTPUT_DIR}"
