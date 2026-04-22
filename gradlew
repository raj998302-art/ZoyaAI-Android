#!/usr/bin/env sh
##############################################################################
##  Gradle wrapper shell script — works in Termux and Linux/macOS
##  Auto-downloads Gradle 8.1.1 if not already cached.
##############################################################################

set -e

GRADLE_VERSION="8.1.1"
GRADLE_DIST="gradle-${GRADLE_VERSION}-bin"
GRADLE_ZIP="${GRADLE_DIST}.zip"
GRADLE_URL="https://services.gradle.org/distributions/${GRADLE_ZIP}"
CACHE_DIR="${HOME}/.gradle/wrapper/dists/${GRADLE_DIST}/manual"
GRADLE_BIN="${CACHE_DIR}/gradle-${GRADLE_VERSION}/bin/gradle"

# ── Use system gradle if available ──────────────────────────
if command -v gradle >/dev/null 2>&1; then
  SYSTEM_VER=$(gradle --version 2>/dev/null | grep -oP 'Gradle \K[0-9]+\.[0-9]+' | head -1)
  echo "Using system Gradle $SYSTEM_VER"
  exec gradle "$@"
fi

# ── Use cached wrapper if available ─────────────────────────
if [ -f "$GRADLE_BIN" ]; then
  exec "$GRADLE_BIN" "$@"
fi

# ── Download Gradle ──────────────────────────────────────────
echo "Downloading Gradle ${GRADLE_VERSION}..."
mkdir -p "$CACHE_DIR"

if command -v wget >/dev/null 2>&1; then
  wget -q --show-progress "$GRADLE_URL" -O "${CACHE_DIR}/${GRADLE_ZIP}"
elif command -v curl >/dev/null 2>&1; then
  curl -L --progress-bar "$GRADLE_URL" -o "${CACHE_DIR}/${GRADLE_ZIP}"
else
  echo "ERROR: Neither wget nor curl found. Install with: pkg install wget"
  exit 1
fi

echo "Extracting Gradle..."
unzip -q "${CACHE_DIR}/${GRADLE_ZIP}" -d "${CACHE_DIR}/"
rm "${CACHE_DIR}/${GRADLE_ZIP}"

echo "Gradle ${GRADLE_VERSION} ready."
exec "$GRADLE_BIN" "$@"
