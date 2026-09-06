#!/bin/bash
# Pack workspace packages into .tgz files for ESRP Release to publish.
#
# ESRP's npm content type has NO per-invocation dist-tag input: it publishes a
# folder of tarballs and honors each tarball's own `publishConfig.tag`. Today the
# dist-tag is a CLI flag (`npm publish --tag alpha`), which does not survive that
# model, so the tag must be baked into package.json BEFORE packing. A tarball with
# no `publishConfig.tag` publishes to `latest` — for an alpha build that would move
# the tag every consumer installs by default.
#
# The dist-tag is specified in the tarball instead of passed to `npm publish`.
#
# `pnpm pack` (not `npm pack`) is required: it rewrites `workspace:*` protocol deps
# to real versions, which npm pack would ship literally and break installs.
#
# Mirrors `from-package` semantics: only packs public packages whose exact
# name@version is not already on the registry, over the CURRENT workspace set
# (which .github/scripts/lerna.sh may have trimmed).
#
# Usage: pack-npm-packages.sh <output-dir> [dist-tag]
#   dist-tag omitted -> bakes `latest` (stable release).

set -euo pipefail

OUT_DIR="${1:?output directory is required}"
DIST_TAG="${2:-latest}"

ROOT_NAME="$(node -p "require('./package.json').name")"

mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

# Build a name<TAB>version<TAB>path table of publishable packages (public, not the
# workspace root), respecting the trimmed pnpm-workspace.yaml.
PKG_TABLE="$(pnpm -r list --depth -1 --json | ROOT_NAME="$ROOT_NAME" node -e '
  let s = "";
  const rootName = process.env.ROOT_NAME;
  process.stdin.on("data", d => (s += d)).on("end", () => {
    for (const p of JSON.parse(s)) {
      if (!p.name || !p.path || p.private) continue;
      if (p.name === rootName) continue;
      console.log([p.name, p.version, p.path].join("\t"));
    }
  });
')"

if [ -z "$PKG_TABLE" ]; then
  echo "No publishable packages found in the current workspace."
  exit 0
fi

# ── Validate the whole set before packing anything ────────────────────────────
# ESRP publishes a folder in one shot and npm versions are immutable, so a set that
# is only partly valid must not reach the ESRP folder at all. Every check that can
# fail the release runs here, before the first tarball is written.
echo "::group::Validate release set (dist-tag: $DIST_TAG)"

# A prerelease version must never take `latest`, and a stable version must never be
# parked on a prerelease tag where nothing would move `latest`.
IS_PRERELEASE_TAG=false
case "$DIST_TAG" in
  latest) ;;
  *) IS_PRERELEASE_TAG=true ;;
esac

PACK_LIST=""
SKIPPED=0
TOTAL=0

while IFS=$'\t' read -r NAME VERSION PKG_PATH; do
  [ -z "$NAME" ] && continue
  TOTAL=$((TOTAL + 1))

  if [ -z "$VERSION" ]; then
    echo "  FAIL $NAME has no version" >&2
    exit 1
  fi

  # `1.2.3-alpha.abc.0` is a prerelease; `1.2.3` is not.
  VERSION_IS_PRERELEASE=false
  case "$VERSION" in
    *-*) VERSION_IS_PRERELEASE=true ;;
  esac

  if [ "$VERSION_IS_PRERELEASE" = true ] && [ "$IS_PRERELEASE_TAG" = false ]; then
    echo "  FAIL $NAME@$VERSION is a prerelease but would be published to 'latest'." >&2
    exit 1
  fi
  if [ "$VERSION_IS_PRERELEASE" = false ] && [ "$IS_PRERELEASE_TAG" = true ]; then
    echo "  FAIL $NAME@$VERSION is stable but would be published to '$DIST_TAG', leaving 'latest' behind." >&2
    exit 1
  fi

  VIEW_ERROR="$(mktemp)"
  if npm view "$NAME@$VERSION" version >/dev/null 2>"$VIEW_ERROR"; then
    echo "  skip $NAME@$VERSION (already on registry)"
    SKIPPED=$((SKIPPED + 1))
    rm -f "$VIEW_ERROR"
    continue
  fi
  if ! grep -qE 'E404|404 Not Found|No match found' "$VIEW_ERROR"; then
    cat "$VIEW_ERROR" >&2
    rm -f "$VIEW_ERROR"
    echo "  FAIL unable to determine whether $NAME@$VERSION is already published." >&2
    exit 1
  fi
  rm -f "$VIEW_ERROR"

  echo "  ok   $NAME@$VERSION -> $DIST_TAG"
  PACK_LIST="${PACK_LIST}${NAME}	${VERSION}	${PKG_PATH}
"
done <<< "$PKG_TABLE"

echo "Validated $TOTAL package(s): $((TOTAL - SKIPPED)) to pack, $SKIPPED already published."
echo "::endgroup::"

if [ -z "$PACK_LIST" ]; then
  echo "Nothing to pack — every package is already published at its current version."
  exit 0
fi

# ── Pack ──────────────────────────────────────────────────────────────────────
# Restore any package.json we rewrote, even on failure, so a baked publishConfig is
# never left behind in the working tree. Backups are kept OUTSIDE the package
# directory: a sibling file would be swept into the tarball for any package that
# does not restrict `files` in package.json.
BACKUP_DIR="$(mktemp -d)"
MODIFIED_DIRS=()
restore() {
  local i=0
  for d in "${MODIFIED_DIRS[@]:-}"; do
    if [ -n "$d" ] && [ -f "$BACKUP_DIR/$i.json" ]; then
      mv "$BACKUP_DIR/$i.json" "$d/package.json"
    fi
    i=$((i + 1))
  done
  return 0
}
trap restore EXIT

PKG_INDEX=0
while IFS=$'\t' read -r NAME VERSION PKG_PATH; do
  [ -z "$NAME" ] && continue
  echo "::group::pack $NAME@$VERSION"

  cp "$PKG_PATH/package.json" "$BACKUP_DIR/$PKG_INDEX.json"
  MODIFIED_DIRS+=("$PKG_PATH")
  PKG_INDEX=$((PKG_INDEX + 1))

  DIST_TAG="$DIST_TAG" node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const tag = process.env.DIST_TAG;
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    pkg.publishConfig = { ...(pkg.publishConfig || {}), tag };
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  ' "$PKG_PATH/package.json"

  (cd "$PKG_PATH" && pnpm pack --pack-destination "$OUT_DIR")

  echo "::endgroup::"
done <<< "$PACK_LIST"

restore
rm -rf "$BACKUP_DIR"
trap - EXIT

# ── Verify the packed output ──────────────────────────────────────────────────
# Re-read the tarballs rather than trusting the write path: this is the exact
# content ESRP will publish.
echo "::group::Verify packed tarballs"
# Run from inside the output directory and use bare filenames: passing a Windows
# absolute path to tar makes it read `C:` as an rsync-style remote host.
(
  cd "$OUT_DIR"
  DIST_TAG="$DIST_TAG" node -e '
    const fs = require("fs");
    const { execFileSync } = require("child_process");
    const expected = process.env.DIST_TAG;

    const files = fs.readdirSync(".").filter(f => f.endsWith(".tgz"));
    if (files.length === 0) throw new Error("No .tgz files were produced");

    for (const f of files) {
      const entries = execFileSync("tar", ["-tzf", f]).toString()
        .split("\n").map(s => s.trim()).filter(Boolean);
      const stray = entries.filter(e => /package\.json\.[^/]*bak$/.test(e));
      if (stray.length) {
        throw new Error(`${f}: packed backup artifacts ${JSON.stringify(stray)}`);
      }

      const raw = execFileSync("tar", ["-xzOf", f, "package/package.json"]);
      const pkg = JSON.parse(raw.toString());
      const tag = pkg.publishConfig && pkg.publishConfig.tag;
      if (tag !== expected) {
        throw new Error(`${f}: publishConfig.tag is ${JSON.stringify(tag)}, expected ${JSON.stringify(expected)}`);
      }
      for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
        for (const [dep, spec] of Object.entries(pkg[field] || {})) {
          if (typeof spec === "string" && spec.startsWith("workspace:")) {
            throw new Error(`${f}: dependency ${dep} still uses the workspace protocol (${spec})`);
          }
        }
      }
      console.log(`  ok ${pkg.name}@${pkg.version} -> ${tag}`);
    }
    console.log(`Verified ${files.length} tarball(s)`);
  '
)
echo "::endgroup::"
