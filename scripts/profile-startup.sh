#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_CONFIG_DIR="${COREAMP_PROFILE_CONFIG_DIR:-/tmp/coreamp-profile}"
PROFILE_LIBRARY_DIR="${COREAMP_PROFILE_LIBRARY_DIR:-/tmp/coreamp-profile-music}"

mkdir -p "${PROFILE_CONFIG_DIR}" "${PROFILE_LIBRARY_DIR}"
if [[ ! -f "${PROFILE_LIBRARY_DIR}/sample.mp3" ]]; then
  printf 'ID3' > "${PROFILE_LIBRARY_DIR}/sample.mp3"
fi

echo "Building release binaries..."
(cd "${ROOT_DIR}" && cargo build --release --workspace)

echo
echo "Profiling daemon single scan startup..."
env COREAMP_CONFIG_DIR="${PROFILE_CONFIG_DIR}" COREAMP_LIBRARY_DIRS="${PROFILE_LIBRARY_DIR}" \
  /usr/bin/time -p "${ROOT_DIR}/target/release/coreamp-daemon" --scan

echo
echo "Profiling app CLI count startup..."
env COREAMP_CONFIG_DIR="${PROFILE_CONFIG_DIR}" COREAMP_LIBRARY_DIRS="${PROFILE_LIBRARY_DIR}" \
  /usr/bin/time -p "${ROOT_DIR}/target/release/coreamp-app" --count
