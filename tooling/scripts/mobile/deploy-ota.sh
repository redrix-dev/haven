#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MOBILE_DIR="$REPO_ROOT/apps/mobile"
DIST_DIR="${OTA_EXPORT_DIR:-$REPO_ROOT/.ota-export}"

ENV_FILE="$REPO_ROOT/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ENV_FILE"
  set +a
fi

: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY in the environment or in $ENV_FILE (service role key; never commit it)}"

SUPABASE_URL="${SUPABASE_URL:-https://uapurngoeceliiwxygdn.supabase.co}"
CHANNEL="${OTA_CHANNEL:-production}"

if [[ -z "${OTA_RELEASE_NOTE:-}" ]]; then
  read -r -p "OTA release note: " OTA_RELEASE_NOTE
else
  echo "Using OTA_RELEASE_NOTE from environment."
fi

if [[ -z "${OTA_RELEASE_NOTE// }" ]]; then
  echo "❌ OTA release note is required (non-empty string)."
  exit 1
fi

GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ]]; then
  echo "⚠️  Warning: Git working tree is not clean; git_sha is still HEAD but may not match uncommitted changes."
fi

RUNTIME_VERSION="$(
  REPO_ROOT="$REPO_ROOT" python3 - <<'PY'
import json
import os
from pathlib import Path

root = Path(os.environ["REPO_ROOT"])
data = json.loads((root / "apps/mobile/app.json").read_text())
print(data["expo"]["runtimeVersion"])
PY
)"

BUNDLE_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
RELEASE_PREFIX="ota-bundles/$BUNDLE_ID"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "🚀 Exporting iOS bundle (runtime $RUNTIME_VERSION)…"
cd "$MOBILE_DIR"
npx expo export --platform ios --output-dir "$DIST_DIR"

IOS_BUNDLE_RELATIVE_PATH="$(
  python3 - <<PY
import json
from pathlib import Path
metadata = Path(r"$DIST_DIR") / "metadata.json"
data = json.loads(metadata.read_text())
print(data["fileMetadata"]["ios"]["bundle"])
PY
)"

BUNDLE_FILE="$DIST_DIR/$IOS_BUNDLE_RELATIVE_PATH"
METADATA_FILE="$DIST_DIR/metadata.json"

if [[ ! -f "$BUNDLE_FILE" ]]; then
  echo "❌ No iOS launch bundle found at $BUNDLE_FILE"
  exit 1
fi

if [[ ! -f "$METADATA_FILE" ]]; then
  echo "❌ No metadata.json under $DIST_DIR"
  exit 1
fi

echo "📦 Uploading bundle to Supabase Storage…"
while IFS= read -r -d '' FILE_PATH; do
  RELATIVE_PATH="${FILE_PATH#"$DIST_DIR"/}"
  if [[ "${FILE_PATH##*.}" == "hbc" ]]; then
    CONTENT_TYPE="application/javascript"
  else
    # GNU file: --mime-type; macOS BSD file: -bI (mime before ';')
    CONTENT_TYPE="$(file -b --mime-type "$FILE_PATH" 2>/dev/null || true)"
    if [[ -z "$CONTENT_TYPE" ]]; then
      CONTENT_TYPE="$(file -bI "$FILE_PATH" 2>/dev/null | cut -d';' -f1 | tr -d ' ' || true)"
    fi
    if [[ -z "$CONTENT_TYPE" ]]; then
      CONTENT_TYPE="application/octet-stream"
    fi
  fi

  curl -fsS -X POST \
    "$SUPABASE_URL/storage/v1/object/$RELEASE_PREFIX/$RELATIVE_PATH" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: $CONTENT_TYPE" \
    --data-binary @"$FILE_PATH"
done < <(find "$DIST_DIR" -type f -print0)

BUNDLE_URL="$SUPABASE_URL/storage/v1/object/public/$RELEASE_PREFIX/$IOS_BUNDLE_RELATIVE_PATH"
MANIFEST_URL="$SUPABASE_URL/storage/v1/object/public/$RELEASE_PREFIX/metadata.json"

echo "📝 Inserting ota_releases row…"
export BUNDLE_ID CHANNEL RUNTIME_VERSION BUNDLE_URL MANIFEST_URL OTA_RELEASE_NOTE GIT_SHA
RELEASE_JSON="$(
  python3 - <<'PY'
import json
import os

payload = {
    "id": os.environ["BUNDLE_ID"],
    "channel": os.environ["CHANNEL"],
    "runtime_version": os.environ["RUNTIME_VERSION"],
    "bundle_url": os.environ["BUNDLE_URL"],
    "manifest_url": os.environ["MANIFEST_URL"],
    "is_active": True,
    "ota_release_note": os.environ["OTA_RELEASE_NOTE"],
    "git_sha": os.environ["GIT_SHA"],
}
print(json.dumps(payload))
PY
)"

curl -fsS -X POST \
  "$SUPABASE_URL/rest/v1/ota_releases" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  --data-binary "$RELEASE_JSON"

echo "✅ OTA update deployed — $BUNDLE_ID"
