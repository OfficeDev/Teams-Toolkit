#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.
#
# CD wrapper (v4-isolated): publish one immutable v4 template release and append
# its staged artifact digest entry to the v4 channel's NDJSON tag-list. This collapses the five
# release-action steps that previously lived inline in cd.yml into one step so
# the v4 footprint in the workflow stays small while the single-coordination
# point (the lerna-minted templates version) is preserved.
#
# It only ever touches the two v4-owned GitHub releases (`templates-v4@<ver>`
# and `template-v4-tag-list`); the v3 `templates@` channel is never read or
# written here.
#
# Usage (run AFTER the templates build, with build/v4 artifacts present):
#   bash .github/scripts/v4/publish-v4-channel.sh \
#     <templates@<ver> tag> <path to create-selector.json> \
#     <path to modify-selector.json> <path to templates-metadata.zip> \
#     <path to templates.zip> <temp dir> <commit sha>
#
# Requires: gh CLI authenticated via GH_TOKEN, node on PATH.
set -euo pipefail

TEMPLATE_TAG="${1:?Need the templates@<ver> tag (steps.version-change.outputs.TEMPLATE_VERSION).}"
CREATE_SELECTOR="${2:?Need the path to create-selector.json.}"
MODIFY_SELECTOR="${3:?Need the path to modify-selector.json.}"
METADATA_ZIP="${4:?Need the path to templates-metadata.zip.}"
TEMPLATES_ZIP="${5:?Need the path to templates.zip.}"
TMP="${6:?Need a temp directory.}"
SHA="${7:?Need the commit sha to anchor the release.}"

RAW_VERSION="${TEMPLATE_TAG#templates@}"

# Clean-version invariant. The v4 channel only ever holds clean versions that a
# `~major.minor` range can resolve. The clean publish version was computed by
# computeV4PublishVersion and recorded as templates-config.json v4.localVersion
# by the preceding "sync v4 template config" step; we reuse that single source
# of truth. A preview (-beta.<date> suffix) maps to the odd-minor line
# (6.11.<date>) — bumped from an even-minor stable base when needed, mirroring
# the VSIX vsc-version.sh mints; a stable version is already clean.
CONFIG_FILE="packages/fx-core/src/common/templates-config.json"
VERSION="$(node -p "(require('./$CONFIG_FILE').v4 || {}).localVersion || '$RAW_VERSION'")"
if [[ "$VERSION" == *-* || "$VERSION" == *+* ]]; then
  echo "v4 publish version must be clean, got '$VERSION'." >&2
  exit 1
fi

TAG="templates-v4@$VERSION"
NDJSON="$TMP/template-v4-tags.ndjson"

# 1. Upsert the immutable per-version release and (re)upload the artifacts.
if ! gh release view "$TAG" >/dev/null 2>&1; then
  gh release create "$TAG" \
    --title "$TAG" \
    --notes "v4 template package for $TAG" \
    --target "$SHA"
fi
gh release upload "$TAG" "$CREATE_SELECTOR" --clobber
gh release upload "$TAG" "$MODIFY_SELECTOR" --clobber
gh release upload "$TAG" "$METADATA_ZIP" --clobber
gh release upload "$TAG" "$TEMPLATES_ZIP" --clobber

# 2. Pull the existing NDJSON tag-list (absent on the first release).
gh release download template-v4-tag-list --pattern template-v4-tags.ndjson --dir "$TMP" || true

# 3. Append (or replace) this version's { version, artifacts } line.
node .github/scripts/v4/generate-v4-tag-list.js \
  --create-selector "$CREATE_SELECTOR" \
  --modify-selector "$MODIFY_SELECTOR" \
  --metadata "$METADATA_ZIP" \
  --templates "$TEMPLATES_ZIP" \
  --version "$VERSION" \
  --ndjson "$NDJSON"

# 4. Upsert the tag-list release and publish the merged NDJSON.
if ! gh release view template-v4-tag-list >/dev/null 2>&1; then
  gh release create template-v4-tag-list \
    --title "Template v4 Tag List" \
    --notes "NDJSON tag list for the v4 template channel."
fi
gh release upload template-v4-tag-list "$NDJSON" --clobber
