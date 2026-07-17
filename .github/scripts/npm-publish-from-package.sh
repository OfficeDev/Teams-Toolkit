#!/bin/bash
# Publish workspace packages to npmjs.org via npm OIDC trusted publishing.
#
# Replaces `lerna publish from-package` (lerna 6 publishes with an old libnpmpublish
# that cannot do the OIDC token exchange). We drive the publish with the npm CLI
# instead, which supports OIDC (>= 11.5.1).
#
# npm's docs support OIDC only for `npm publish` run in a package directory, so we
# publish that way. But plain `npm publish` would ship pnpm's `workspace:*` protocol
# deps literally and break installs, so we first rewrite those deps to real versions
# (what pnpm pack would do), publish, then restore the original package.json files.
#
# Mirrors `from-package` semantics: only publishes public packages whose exact
# name@version is not already on the registry, over the CURRENT workspace set
# (which .github/scripts/lerna.sh may have trimmed).
#
# Usage: npm-publish-from-package.sh [dist-tag]
#   dist-tag omitted -> publishes with the default `latest` tag (stable release).

set -euo pipefail

DIST_TAG="${1:-}"

ROOT_NAME="$(node -p "require('./package.json').name")"

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

# Map of package name -> version, for resolving workspace: protocol deps. This
# includes ALL workspace members (even private/root) so any internal dep resolves.
VERSION_MAP="$(pnpm -r list --depth -1 --json | node -e '
  let s = "";
  process.stdin.on("data", d => (s += d)).on("end", () => {
    const m = {};
    for (const p of JSON.parse(s)) if (p.name && p.version) m[p.name] = p.version;
    process.stdout.write(JSON.stringify(m));
  });
')"

# Restore any package.json we rewrote, even on failure, so workspace: deps are never
# left resolved in the working tree.
MODIFIED_DIRS=()
restore() {
  for d in "${MODIFIED_DIRS[@]:-}"; do
    [ -n "$d" ] && [ -f "$d/package.json.bak" ] && mv "$d/package.json.bak" "$d/package.json"
  done
}
trap restore EXIT

while IFS=$'\t' read -r NAME VERSION PKG_PATH; do
  [ -z "$NAME" ] && continue
  echo "::group::$NAME@$VERSION"

  if npm view "$NAME@$VERSION" version >/dev/null 2>&1; then
    echo "Already published, skipping."
    echo "::endgroup::"
    continue
  fi

  # Rewrite workspace: protocol deps to real versions (workspace:* -> X,
  # workspace:^ -> ^X) using the sibling packages' current versions.
  cp "$PKG_PATH/package.json" "$PKG_PATH/package.json.bak"
  MODIFIED_DIRS+=("$PKG_PATH")
  VERSION_MAP="$VERSION_MAP" node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const versions = JSON.parse(process.env.VERSION_MAP);
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      const deps = pkg[field];
      if (!deps) continue;
      for (const [dep, spec] of Object.entries(deps)) {
        if (typeof spec !== "string" || !spec.startsWith("workspace:")) continue;
        const v = versions[dep];
        if (!v) throw new Error(`Cannot resolve workspace dep ${dep} in ${file}`);
        const range = spec.slice("workspace:".length);
        deps[dep] = range === "*" || range === "" ? v : range.charAt(0) + v;
      }
    }
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  ' "$PKG_PATH/package.json"

  pushd "$PKG_PATH" >/dev/null
  if [ -n "$DIST_TAG" ]; then
    npm publish --tag "$DIST_TAG"
  else
    npm publish
  fi
  popd >/dev/null

  echo "::endgroup::"
done <<< "$PKG_TABLE"
