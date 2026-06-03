#!/bin/bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
APP_NAME="CFDesk"
TEAM_ID="${CFDESK_APPLE_TEAM_ID:-PCJ84YD7HQ}"
SIGNING_IDENTITY="${CFDESK_SIGNING_IDENTITY:-Developer ID Application: Freedom Dimension (shenzhen) Technology Co., Ltd (${TEAM_ID})}"
NOTARY_PROFILE="${CFDESK_NOTARY_PROFILE:-cfdesk-notary}"
NOTARY_TIMEOUT="${CFDESK_NOTARY_TIMEOUT:-30m}"
TARGET_TRIPLE="${CFDESK_TARGET_TRIPLE:-aarch64-apple-darwin}"
ARCH_NAME="${CFDESK_ARCH_NAME:-aarch64}"

DEFAULT_APP_SOURCE="${ROOT_DIR}/src-tauri/target/${TARGET_TRIPLE}/release/bundle/macos/${APP_NAME}.app"
FALLBACK_APP_SOURCE="${ROOT_DIR}/src-tauri/target/release/bundle/macos/${APP_NAME}.app"

if [ -n "${CFDESK_APP_SOURCE:-}" ]; then
  APP_SOURCE="$CFDESK_APP_SOURCE"
elif [ -d "$DEFAULT_APP_SOURCE" ]; then
  APP_SOURCE="$DEFAULT_APP_SOURCE"
else
  APP_SOURCE="$FALLBACK_APP_SOURCE"
fi

SIGNED_DIR="${CFDESK_SIGNED_DIR:-${ROOT_DIR}/src-tauri/target/${TARGET_TRIPLE}/release/bundle/signed}"
STAGING_DIR="${SIGNED_DIR}/root"
SIGNED_APP="${STAGING_DIR}/${APP_NAME}.app"
VERSION=$(node -e "console.log(require('${ROOT_DIR}/package.json').version)")
SIGNED_DMG="${SIGNED_DIR}/${APP_NAME}_${VERSION}_${ARCH_NAME}_signed.dmg"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' was not found."
    exit 1
  fi
}

notary_profile_exists() {
  xcrun notarytool history \
    --keychain-profile "$NOTARY_PROFILE" \
    --output-format json >/dev/null 2>&1
}

require_command codesign
require_command hdiutil
require_command node
require_command security
require_command spctl
require_command xcrun

if [ ! -d "$APP_SOURCE" ]; then
  echo "Error: app bundle not found: $APP_SOURCE"
  echo "Run 'bun tauri build' first."
  exit 1
fi

if ! security find-identity -v -p codesigning | grep -F "$SIGNING_IDENTITY" >/dev/null; then
  echo "Error: signing identity not found in keychain:"
  echo "  $SIGNING_IDENTITY"
  exit 1
fi

rm -rf "$SIGNED_DIR"
mkdir -p "$STAGING_DIR"

echo "Copying app bundle..."
ditto "$APP_SOURCE" "$SIGNED_APP"

echo "Signing app with Developer ID..."
codesign --force \
  --options runtime \
  --timestamp \
  --sign "$SIGNING_IDENTITY" \
  "$SIGNED_APP"

echo "Verifying signed app..."
codesign --verify --deep --strict --verbose=4 "$SIGNED_APP"
codesign -dv --verbose=4 "$SIGNED_APP" 2>&1 | sed -n '1,80p'

echo "Creating DMG..."
hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$SIGNED_DMG"

echo "Signing DMG..."
codesign --force \
  --timestamp \
  --sign "$SIGNING_IDENTITY" \
  "$SIGNED_DMG"

echo "Verifying signed DMG..."
codesign --verify --verbose=4 "$SIGNED_DMG"
codesign -dv --verbose=4 "$SIGNED_DMG" 2>&1 | sed -n '1,80p'

if [ "${CFDESK_SKIP_NOTARY:-0}" = "1" ]; then
  echo "Skipping notarization because CFDESK_SKIP_NOTARY=1."
  echo "Signed DMG: $SIGNED_DMG"
  exit 0
fi

if ! notary_profile_exists; then
  echo "Error: notarytool keychain profile '$NOTARY_PROFILE' was not found."
  echo "Create it with:"
  echo "  xcrun notarytool store-credentials $NOTARY_PROFILE --apple-id <apple-id> --team-id $TEAM_ID"
  echo "Or rerun with CFDESK_SKIP_NOTARY=1 to only sign the app and DMG."
  exit 1
fi

echo "Submitting DMG for notarization..."
xcrun notarytool submit "$SIGNED_DMG" \
  --keychain-profile "$NOTARY_PROFILE" \
  --wait \
  --timeout "$NOTARY_TIMEOUT"

echo "Stapling notarization ticket..."
xcrun stapler staple "$SIGNED_DMG"
xcrun stapler validate "$SIGNED_DMG"

echo "Assessing notarized DMG..."
spctl --assess --type open --context context:primary-signature --verbose=4 "$SIGNED_DMG"

echo "Notarized DMG: $SIGNED_DMG"
